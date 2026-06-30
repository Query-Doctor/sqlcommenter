import { alreadyHasTrailingComment, serializeTags, type Tag } from "./sqlcommenter.js";
import { als } from "./als.js";
import { pushW3CTraceContext } from "./tracing.js";
import { resolveFilePath } from "./path.js";

const LIBRARY_NAME = "sqlcommenter-mikroorm";

type ConfigLike = {
  get(key: "onQuery"): (sql: string, params: readonly unknown[]) => string;
  set(key: "onQuery", value: (sql: string, params: readonly unknown[]) => string): void;
};

type MikroORMLike = {
  config: ConfigLike;
};

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

function buildOnQuery(
  existingOnQuery: (sql: string, params: readonly unknown[]) => string,
): (sql: string, params: readonly unknown[]) => string {
  return (sql: string, params: readonly unknown[]): string => {
    // chain existing onQuery first
    sql = existingOnQuery(sql, params);

    try {
      if (alreadyHasTrailingComment(sql)) {
        return sql;
      }

      const caller = traceCaller();
      const requestContext = als.getStore();
      const tags: Tag[] = [
        [WellKnownFields.dbDriver, "mikroorm"],
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
      return sql + serializeTags(tags);
    } catch {
      // never let comment generation break query execution
      return sql;
    }
  };
}

/**
 * Patches a MikroORM instance to append sqlcommenter tags to all queries.
 * Uses MikroORM's built-in `onQuery` configuration hook (available since v6.4).
 * Call this after `MikroORM.init()`.
 *
 * If an existing `onQuery` handler is already configured, it will be chained
 * (the existing handler runs first, then sqlcommenter tags are appended).
 *
 * @example
 * ```ts
 * import { MikroORM } from "@mikro-orm/core";
 * import { patchMikroORM } from "@query-doctor/sqlcommenter-mikroorm";
 *
 * const mikroORM = await MikroORM.init({
 *   dbName: "my-db",
 *   entities: [...],
 * });
 * const orm = patchMikroORM(mikroORM);
 * ```
 */
export function patchMikroORM<T extends MikroORMLike>(orm: T): T {
  const existingOnQuery = orm.config.get("onQuery");
  orm.config.set("onQuery", buildOnQuery(existingOnQuery));
  return orm;
}
