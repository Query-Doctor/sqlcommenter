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
let currentCaller: CallerInfo | undefined;

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

/** The provenance captured from a single V8 stack frame. */
export type CallerInfo = {
  // The source location, `path:line:col`, resolved to the real project root.
  file: string;
  // The enclosing function/method symbol as V8 reports it (e.g. `UserService.list`,
  // `reactionsRepo.findFavorites`). Absent for anonymous/top-level frames. Unlike `file`,
  // a symbol is edit-stable — it doesn't drift when lines above the call site change.
  symbol?: string;
};

/**
 * Pulls the enclosing function/method symbol out of a V8 stack frame. Named frames look like
 * `    at <symbol> (<location>)`; anonymous/top-level frames are `    at <location>` with no
 * symbol to capture, so we return nothing and the caller falls back to `file` alone.
 */
function extractSymbol(frame: string): string | undefined {
  const match = frame.match(/^\s*at (.+) \(/);
  if (!match) {
    return;
  }
  // V8 prefixes async frames with `async ` in some versions; the symbol is what follows.
  const symbol = match[1].replace(/^async /, "");
  // Anonymous functions — including arrow-assigned methods that surface as
  // `Object.<anonymous>` in bundled/minified builds — carry no stable name.
  if (!symbol || symbol.includes("<anonymous>")) {
    return;
  }
  return symbol;
}

export function traceCaller(): CallerInfo | undefined {
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
    // The symbol comes from the same frame we already selected — no new frame-selection logic.
    return { file: resolveFilePath(match[1]), symbol: extractSymbol(methodCaller) };
  }
}

/**
 * Wraps `then`/`execute`/`prepare` on a built query so that, while the query synchronously
 * reaches `prepareQuery`, its own build-time caller is the one published in `currentCaller`.
 */
function tagExecutable(executable: any, caller: CallerInfo) {
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
function wrapBuilder(builder: any, caller: CallerInfo): unknown {
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

function handleResult(result: any, caller: CallerInfo): unknown {
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

const CRUD_METHODS = [
  "select",
  "selectDistinct",
  "selectDistinctOn",
  "insert",
  "update",
  "delete",
] as const;

// Marks a db/transaction object whose query methods we've already wrapped, so re-patching
// (e.g. a double `patchDrizzle` call) is a no-op.
const PATCHED_METHODS = Symbol("sqlcommenter-drizzle.patched-methods");

type QueryMethodHost = {
  execute?: unknown;
  transaction?: unknown;
  query?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

/**
 * Wraps the query-building methods on a drizzle db — or a transaction handle — so the caller is
 * captured for every query built through it.
 *
 * `db.transaction(cb)` hands `cb` a fresh `tx` object whose methods are NOT the ones patched on
 * the top-level db, so queries built inside a transaction would otherwise lose their
 * `file`/`func_name` tags (only `db_driver`, added in `prepareQuery`, would survive). We wrap the
 * transaction callback and recursively patch the `tx` — including any nested savepoint `tx` — the
 * same way.
 */
function patchQueryMethods(target: QueryMethodHost) {
  const guard = target as unknown as Record<symbol, boolean>;
  if (!target || typeof target !== "object" || guard[PATCHED_METHODS]) {
    return;
  }
  guard[PATCHED_METHODS] = true;

  if (typeof target.execute === "function") {
    target.execute = new Proxy(target.execute, {
      apply: (fn, thisArg, args) => patchImmediateMethod(fn, thisArg, args),
    });
  }
  if (target.query) {
    for (const key in target.query) {
      const schema = target.query[key];
      for (const func of DRIZZLE_ORM_MODE_METHODS) {
        if (!schema || typeof schema[func] !== "function") {
          continue;
        }
        schema[func] = new Proxy(schema[func] as Function, {
          apply: (fn, thisArg, args) => patchBuilderMethod(fn, thisArg, args),
        });
      }
    }
  }
  for (const method of CRUD_METHODS) {
    // not all drivers have all these calls so better be safe
    if (typeof target[method] !== "function") {
      continue;
    }
    // Patching the CRUD entrypoints. The caller is captured here, when the query is built,
    // because the build-time stack is the only place the user's call site is still visible —
    // by the time the query executes (a microtask later) it's gone. `patchBuilderMethod` tags
    // the built query so the caller is reattached for its own synchronous `prepareQuery` window.
    target[method] = new Proxy(target[method] as Function, {
      apply: (fn, thisArg, args) => patchBuilderMethod(fn, thisArg, args),
    });
  }
  if (typeof target.transaction === "function") {
    target.transaction = new Proxy(target.transaction, {
      apply(fn, thisArg, args) {
        const [callback, ...rest] = args as [unknown, ...unknown[]];
        if (typeof callback !== "function") {
          return Reflect.apply(fn, thisArg, args);
        }
        const wrapped = function (this: unknown, tx: QueryMethodHost, ...cbArgs: unknown[]) {
          patchQueryMethods(tx);
          return (callback as Function).apply(this, [tx, ...cbArgs]);
        };
        return Reflect.apply(fn, thisArg, [wrapped, ...rest]);
      },
    });
  }
}

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
  patchQueryMethods(drizzle as QueryMethodHost);
  return drizzle;
}

const WellKnownFields = {
  dbDriver: "db_driver",
  file: "file",
  funcName: "func_name",
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
      if (caller?.file) {
        tags.push([WellKnownFields.file, caller.file]);
      }
      // The enclosing symbol is edit-stable provenance; absent for anonymous frames.
      if (caller?.symbol) {
        tags.push([WellKnownFields.funcName, caller.symbol]);
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
