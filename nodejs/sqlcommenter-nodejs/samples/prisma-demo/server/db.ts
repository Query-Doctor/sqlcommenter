import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  queryTags,
  withQueryTags,
  withMergedQueryTags,
} from "@prisma/sqlcommenter-query-tags";
import type { SqlCommenterPlugin } from "@prisma/sqlcommenter";
import { addQueryLog } from "./query-log.js";

const connectionString = process.env.DATABASE_URL!;

const pool = new pg.Pool({ connectionString });

// Intercept queries at the pool level to capture SQL with comments
const originalQuery = pool.query.bind(pool);
(pool as any).query = function (...args: any[]) {
  const sql =
    typeof args[0] === "string" ? args[0] : args[0]?.text ?? String(args[0]);
  const start = performance.now();
  const result = originalQuery(...args);
  if (result && typeof result.then === "function") {
    result.then(
      () => addQueryLog(sql, performance.now() - start),
      () => addQueryLog(sql, performance.now() - start),
    );
  } else {
    addQueryLog(sql, performance.now() - start);
  }
  return result;
};

// Custom sqlcommenter plugin: adds db_driver, model, and action
const appPlugin: SqlCommenterPlugin = (context) => ({
  db_driver: "prisma",
  ...(context.query.modelName && { model: context.query.modelName }),
  action: context.query.action,
});

const adapter = new PrismaPg(pool);

const _prisma = new PrismaClient({
  adapter,
  comments: [appPlugin, queryTags()],
});

// --- Auto-capture call-site file:line as a query tag ---

function applyWslPrefix(filePath: string): string {
  const distro = process.env.WSL_DISTRO_NAME;
  if (distro) return `//wsl.localhost/${distro}${filePath}`;
  return filePath;
}

function extractCallerFile(stack: string): string | undefined {
  const lines = stack.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("node_modules") || line.includes("node:")) continue;
    const match =
      line.match(/\((.+?):(\d+):(\d+)\)/) ||
      line.match(/at (.+?):(\d+):(\d+)/);
    if (match) {
      const filePath = match[1];
      if (filePath.endsWith("/server/db.ts")) continue;
      if (!filePath.includes("/server/")) continue;
      return `${applyWslPrefix(filePath)}:${match[2]}:${match[3]}`;
    }
  }
  return undefined;
}

const modelNames = [
  "user",
  "project",
  "issue",
  "label",
  "comment",
] as const;
const queryMethods = [
  "findMany",
  "findUnique",
  "findFirst",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
];

for (const model of modelNames) {
  const delegate = (_prisma as any)[model];
  if (!delegate) continue;
  for (const method of queryMethods) {
    if (typeof delegate[method] !== "function") continue;
    const original = delegate[method].bind(delegate);
    delegate[method] = function (...args: any[]) {
      const stack = new Error().stack ?? "";
      const file = extractCallerFile(stack);
      const promise = original(...args);
      if (!file) return promise;
      return {
        then(onFulfilled: any, onRejected: any) {
          return withMergedQueryTags({ file }, () => promise).then(
            onFulfilled,
            onRejected,
          );
        },
        catch(onRejected: any) {
          return this.then(undefined, onRejected);
        },
        finally(onFinally: any) {
          return this.then(
            (value: any) => {
              onFinally?.();
              return value;
            },
            (reason: any) => {
              onFinally?.();
              throw reason;
            },
          );
        },
        [Symbol.toStringTag]: "PrismaPromise",
      };
    };
  }
}

export const prisma = _prisma;

// Re-export withQueryTags for use in middleware
export { withQueryTags };
