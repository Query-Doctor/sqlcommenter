import { alreadyHasComment, serializeTags } from "./sqlcommenter.js";
import { als } from "./als.js";
import { pushW3CTraceContext } from "./tracing.js";

const LIBRARY_NAME = "sqlcommenter-drizzle";

type QueryContext = {
  queryStack: string[];
};

type DriverSession = { prepareQuery: (query: unknown) => unknown };

// We don't own the Session object here so using a WeakMap to prevent memory leaks
// An alternative could be to set a Symbol in the Session to store the context
// but this approach seems a little bit safer as we avoid interfacing with the object at all
const contexts = new WeakMap<DriverSession, QueryContext>();

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
    return match[1];
  }
}

function patchMethod(
  target: Function,
  thisArg: unknown,
  args: any[],
  session: DriverSession,
) {
  const caller = traceCaller();
  if (caller) {
    const ctx = contexts.get(session);
    if (ctx) {
      ctx.queryStack.push(caller);
    } else {
      contexts.set(session, { queryStack: [caller] });
    }
  }
  return Reflect.apply(target, thisArg, args);
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
      apply(target, thisArg, args) {
        const session = thisArg.session;
        return patchMethod(target, thisArg, args, session);
      },
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
          apply(target, thisArg, args) {
            const session = thisArg.session;
            return patchMethod(target, thisArg, args, session);
          },
        });
      }
    }
  }
  for (const method of methods) {
    // not all drivers have all these calls so better be safe
    if (!drizzle[method] || typeof drizzle[method] !== "function") {
      continue;
    }
    // patching the CRUD functions.
    // the correct function to patch here is QueryPromise.prototype.then
    // but because of the way microtasks work, by the time `then` fires,
    // the stack is already clear and the caller name is no longer available
    // so we have to forcibly get it earlier when the query is built.
    // TODO: This isn't 100% reliable as the user could build a query and not run it until much later
    // which could throw off this process completely.
    drizzle[method] = new Proxy(drizzle[method], {
      apply(target, thisArg, args) {
        const session = thisArg._.session;
        return patchMethod(target, thisArg, args, session);
      },
    });
  }
  return drizzle;
}

const WellKnownFields = {
  dbDriver: "db_driver",
  file: "file",
  route: "route",
} as const;

// This is very non-standard. If `file` is to be a semantic convention this probably
// needs to be discussed with the community. It's what we use at query-doctor so
// sticking with it f
const SQLCOMMENTER_ARRAY_ELEM_DELIMITER = ";";

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
      try {
        const ctx = contexts.get(thisArg);
        const requestContext = als.getStore();
        const tags: [string, string][] = [
          [WellKnownFields.dbDriver, "drizzle"],
        ];
        // adding traceparent and tracestate
        pushW3CTraceContext(tags);
        if (ctx) {
          tags.push([
            WellKnownFields.file,
            // questionable
            ctx.queryStack.join(SQLCOMMENTER_ARRAY_ELEM_DELIMITER),
          ]);
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
      } finally {
        contexts.delete(thisArg);
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
}
