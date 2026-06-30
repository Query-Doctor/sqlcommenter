import { alreadyHasTrailingComment, serializeTags, type Tag } from "./sqlcommenter.js";
import { als } from "./als.js";
import { pushW3CTraceContext } from "./tracing.js";
import { resolveFilePath } from "./path.js";

const LIBRARY_NAME = "sqlcommenter-typeorm";

type DataSourceLike = {
  createQueryRunner: (...args: any[]) => QueryRunnerLike;
};

type QueryRunnerLike = {
  query: (
    query: string,
    parameters?: any[],
    useStructuredResult?: boolean,
  ) => Promise<any>;
};

const PATCHED = Symbol("sqlcommenter-patched");

function isValidCaller(line: string): boolean {
  if (line.includes("node_modules")) {
    return false;
  }
  if (line.includes(`${LIBRARY_NAME}/test/`)) {
    return true;
  }
  if (line.includes(LIBRARY_NAME)) {
    return false;
  }
  return true;
}

// (file.ts:12:12) or file.ts:12:12
const filepathRegex = /([^ (]*?:\d+:\d+)\)?$/;

/** The provenance captured from a single V8 stack frame. */
export type CallerInfo = {
  // The source location, `path:line:col`, resolved to the real project root.
  file: string;
  // The enclosing function/method symbol as V8 reports it (e.g. `UserService.list`). Absent for
  // anonymous/top-level frames. Unlike `file`, it's edit-stable — a method name doesn't drift
  // when lines above the call site change.
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
  const stack = new Error().stack;
  if (!stack) {
    return;
  }
  // skip 1 line for `Error:`, 1 line for the caller of the current function
  const stackLines = stack.split("\n").slice(2);
  const methodCaller = stackLines.find(isValidCaller);
  if (!methodCaller) {
    return;
  }
  const match = methodCaller.match(filepathRegex);
  if (match) {
    return { file: resolveFilePath(match[1]), symbol: extractSymbol(methodCaller) };
  }
}

const WellKnownFields = {
  dbDriver: "db_driver",
  file: "file",
  funcName: "func_name",
  route: "route",
} as const;

function patchQueryRunnerPrototype(proto: any) {
  if (proto[PATCHED]) {
    return;
  }
  const originalQuery = proto.query;
  if (typeof originalQuery !== "function") {
    console.debug(
      "Invalid QueryRunner prototype. Missing `query`, did TypeORM change its API?",
      proto,
    );
    return;
  }
  proto.query = new Proxy(originalQuery, {
    async apply(target, thisArg, args) {
      try {
        const [query] = args;
        if (typeof query === "string" && !alreadyHasTrailingComment(query)) {
          const caller = traceCaller();
          const requestContext = als.getStore();
          const tags: Tag[] = [
            [WellKnownFields.dbDriver, "typeorm"],
          ];
          pushW3CTraceContext(tags);
          if (caller?.file) {
            tags.push([WellKnownFields.file, caller.file]);
          }
          // The enclosing symbol is edit-stable provenance; absent for anonymous frames.
          if (caller?.symbol) {
            tags.push([WellKnownFields.funcName, caller.symbol]);
          }
          if (requestContext) {
            for (const key in requestContext) {
              tags.push([key, String(requestContext[key])]);
            }
          }
          const sqlComment = serializeTags(tags);
          args[0] = query + sqlComment;
        }
      } catch {
        // never let comment generation break query execution
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
  proto[PATCHED] = true;
}

/**
 * Patches a TypeORM DataSource to append sqlcommenter tags to all queries.
 * Call this after creating the DataSource (before or after initialize).
 *
 * @example
 * ```ts
 * import { DataSource } from "typeorm";
 * import { patchTypeORM } from "@query-doctor/sqlcommenter-typeorm";
 *
 * const dataSource = patchTypeORM(new DataSource({
 *   type: "postgres",
 *   url: process.env.DATABASE_URL,
 * }));
 * ```
 */
export function patchTypeORM<T extends DataSourceLike>(dataSource: T): T {
  const originalCreateQueryRunner = dataSource.createQueryRunner;
  dataSource.createQueryRunner = new Proxy(originalCreateQueryRunner, {
    apply(target, thisArg, args) {
      const queryRunner = Reflect.apply(target, thisArg, args);
      const proto = Object.getPrototypeOf(queryRunner);
      patchQueryRunnerPrototype(proto);
      return queryRunner;
    },
  });
  return dataSource;
}
