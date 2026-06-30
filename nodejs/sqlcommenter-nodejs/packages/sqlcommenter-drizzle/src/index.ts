import { alreadyHasComment, serializeTags } from "./sqlcommenter.js";
import { als } from "./als.js";
import { pushW3CTraceContext } from "./tracing.js";
import { resolveFilePath } from "./path.js";

const LIBRARY_NAME = "sqlcommenter-drizzle";

type DriverSession = { prepareQuery: (query: unknown) => unknown };

// The caller's source location has to be captured when a query is *built* (e.g. `db.select()`),
// because by the time the query actually executes the build-time stack frame is long gone.
// That caller then has to reach the `prepareQuery` patch that writes the comment.
//
// A single `drizzle()` instance shares ONE session object across every query it builds, so the
// caller cannot be keyed by the session: two queries built before either executes would collide
// on the same entry, mis-attributing one `file` tag and dropping the other under any real
// concurrency (e.g. two in-flight HTTP requests, or `Promise.all`).
//
// Instead we tag each built query object with its own caller, and publish that caller into
// `currentCaller` for the *synchronous* window in which that specific query reaches
// `prepareQuery` (`then`/`execute`/`prepare` -> `_prepare` -> `session.prepareQuery` runs with
// no `await` in between). Because the window is synchronous, concurrent queries can never
// interleave inside it, so each query reads exactly its own caller.
let currentCaller: string | undefined;

// Marks a query object whose `then`/`execute`/`prepare` have already been wrapped, so chained
// rebuilds returning the same object aren't wrapped twice.
const TAGGED = Symbol("sqlcommenter-drizzle.tagged");

function isValidCaller(line: string): boolean {
  if (line.includes("node_modules")) {
    return false;
  }
  // make sure we don't break our own tests
  // should ideally not even be included in this function to begin with since
  // it'll never be true outside of testing
  if (line.includes(`${LIBRARY_NAME}/test/`)) {
    return true;
  }
  if (line.includes(LIBRARY_NAME)) {
    return false;
  }
  return true;
}

// (file.ts:12:12) or file.ts:12:12
// this is not 100% correct. Folders and filenames can have spaces in them
// but its hard to parse that manually. Let future me deal with it
const filepathRegex = /([^ (]*?:\d+:\d+)\)?$/;

export function traceCaller(): string | undefined {
  // we're not using the Error.capturaStackTrace because it doesn't play nicely
  // with stack traces that aren't full paths to a specific file.
  // eg: webpack:// or relative paths will produce no result at all so that's not usable
  const stack = new Error().stack;
  // can this ever happen?
  if (!stack) {
    return;
  }
  // skip 1 line for `Error:`, 1 line for the caller of the current function
  // not hardcoding further to prevent fragile implementation
  const stackLines = stack.split("\n").slice(2);
  const methodCaller = stackLines.find(isValidCaller);
  if (!methodCaller) {
    return;
  }
  const match = methodCaller.match(filepathRegex);
  if (match) {
    return resolveFilePath(match[1]);
  }
}

/**
 * Wraps `then`/`execute`/`prepare` on a built query so that, while the query synchronously
 * reaches `prepareQuery`, its own build-time caller is the one published in `currentCaller`.
 */
function tagExecutable(executable: any, caller: string) {
  if (!executable || typeof executable !== "object" || executable[TAGGED]) {
    return;
  }
  executable[TAGGED] = true;
  for (const method of ["then", "execute", "prepare"] as const) {
    const original = executable[method];
    if (typeof original !== "function") {
      continue;
    }
    executable[method] = function (this: unknown, ...args: unknown[]) {
      const previous = currentCaller;
      currentCaller = caller;
      try {
        return original.apply(this, args);
      } finally {
        currentCaller = previous;
      }
    };
  }
}

/**
 * `db.select()`/`db.insert()`/`db.update()` return an intermediate *builder*; the executable
 * query is produced one call later by `.from()`/`.values()`/`.set()`. We wrap the builder in a
 * Proxy so that whatever its methods return is run back through `handleResult` and the eventual
 * executable gets tagged with the caller captured at build time.
 */
function wrapBuilder(builder: any, caller: string): unknown {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return function (this: unknown, ...args: unknown[]) {
        return handleResult(value.apply(target, args), caller);
      };
    },
  });
}

function handleResult(result: any, caller: string): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }
  // A built, executable query (a drizzle QueryPromise) is thenable — tag it directly.
  if (typeof result.then === "function") {
    tagExecutable(result, caller);
    return result;
  }
  // Otherwise it's still a builder; keep wrapping until the executable shows up.
  return wrapBuilder(result, caller);
}

/**
 * Patches a builder-returning method (`select`/`insert`/`update`/`delete`/relational queries).
 * The result is lazy, so we tag it and let `currentCaller` be set when it executes.
 */
function patchBuilderMethod(target: Function, thisArg: unknown, args: any[]) {
  const caller = traceCaller();
  const result = Reflect.apply(target, thisArg, args);
  return caller ? handleResult(result, caller) : result;
}

/**
 * Patches an eager method (`db.execute()`), which builds *and* reaches `prepareQuery`
 * synchronously within this call, so the caller is published around the call itself.
 */
function patchImmediateMethod(target: Function, thisArg: unknown, args: any[]) {
  const caller = traceCaller();
  if (!caller) {
    return Reflect.apply(target, thisArg, args);
  }
  const previous = currentCaller;
  currentCaller = caller;
  try {
    return Reflect.apply(target, thisArg, args);
  } finally {
    currentCaller = previous;
  }
}

const DRIZZLE_ORM_MODE_METHODS = ["findFirst", "findMany"] as const;

export function patchDrizzle<T>(
  drizzle: T & {
    // is this nullable?
    session?: DriverSession;
    execute: unknown;
    // not all these methods exist on all clients
    select?: Function;
    selectDistinct?: Function;
    selectDistinctOn?: Function;
    insert?: Function;
    update?: Function;
    delete?: Function;
  },
): T {
  try {
    if ("session" in drizzle && drizzle.session) {
      patchSession(drizzle.session);
    } else {
      // console.debug("No session found in drizzle");
    }
  } catch (e) {
    console.error("Error patching driver", e);
  }
  const methods = [
    "select",
    "selectDistinct",
    "selectDistinctOn",
    "insert",
    "update",
    "delete",
  ] as const;
  if (typeof drizzle.execute === "function") {
    drizzle.execute = new Proxy(drizzle.execute, {
      apply: (target, thisArg, args) =>
        patchImmediateMethod(target, thisArg, args),
    });
  }
  if (drizzle && "query" in drizzle && drizzle.query) {
    for (const key in drizzle.query) {
      for (const func of DRIZZLE_ORM_MODE_METHODS) {
        const schema = drizzle.query[key as keyof typeof drizzle.query];
        if (!schema[func] || typeof schema[func] !== "function") {
          continue;
        }
        schema[func] = new Proxy(schema[func], {
          apply: (target, thisArg, args) =>
            patchBuilderMethod(target, thisArg, args),
        });
      }
    }
  }
  for (const method of methods) {
    // not all drivers have all these calls so better be safe
    if (!drizzle[method] || typeof drizzle[method] !== "function") {
      continue;
    }
    // Patching the CRUD entrypoints. The caller is captured here, when the query is built,
    // because the build-time stack is the only place the user's call site is still visible —
    // by the time the query executes (a microtask later) it's gone. `patchBuilderMethod` tags
    // the built query so the caller is reattached for its own synchronous `prepareQuery` window.
    drizzle[method] = new Proxy(drizzle[method], {
      apply: (target, thisArg, args) =>
        patchBuilderMethod(target, thisArg, args),
    });
  }
  return drizzle;
}

const WellKnownFields = {
  dbDriver: "db_driver",
  file: "file",
  route: "route",
} as const;

/**
 * Drizzle session is responsible for serializing the query and sending it downstream to
 * the driver. We're patching `prepareQuery` to add the SQL comments there instead of
 * patching every single driver that could be used with Drizzle.
 */
function patchSession(session: DriverSession) {
  const proto = Object.getPrototypeOf(session);
  if (!("prepareQuery" in proto) || typeof proto.prepareQuery !== "function") {
    console.debug(
      "Invalid session prototype. Missing `prepareQuery`, did drizzle change its API?",
      proto,
    );
    return;
  }
  proto.prepareQuery = new Proxy(proto.prepareQuery, {
    apply(target, thisArg, args) {
      // `currentCaller` is set by the built query whose synchronous execution reached this
      // call, so it's exactly the caller of the query being prepared.
      const caller = currentCaller;
      const requestContext = als.getStore();
      const tags: [string, string][] = [[WellKnownFields.dbDriver, "drizzle"]];
      // adding traceparent and tracestate
      pushW3CTraceContext(tags);
      if (caller) {
        tags.push([WellKnownFields.file, caller]);
      }
      if (args[0]) {
        const query = args[0];
        if (!alreadyHasComment(query.sql)) {
          if (requestContext) {
            for (const key in requestContext) {
              tags.push([key, String(requestContext[key])]);
            }
          }
          const sqlComment = serializeTags(tags);
          query.sql += sqlComment;
        }
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
}
