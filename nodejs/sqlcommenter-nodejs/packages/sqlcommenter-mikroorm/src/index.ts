import { alreadyHasTrailingComment, serializeTags, type Tag } from "./sqlcommenter.js";
import { als } from "./als.js";
import { pushW3CTraceContext } from "./tracing.js";

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

export function traceCaller(): string | undefined {
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
    return match[1];
  }
}

const WellKnownFields = {
  dbDriver: "db_driver",
  file: "file",
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
      if (caller) {
        tags.push([WellKnownFields.file, caller]);
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
