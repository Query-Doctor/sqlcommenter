import { test } from "node:test";
import assert from "node:assert";
import { wrapAdapter } from "../src/adapter.js";
import { sqlcommenterExtension } from "../src/extension.js";
import { queryContextAls, requestContextAls } from "../src/als.js";

/**
 * Creates a mock driver adapter that records all SQL queries sent to it.
 */
function createMockAdapter() {
  const queries: string[] = [];
  const executions: string[] = [];

  const adapter = {
    queryRaw(params: { sql: string; args?: unknown[] }) {
      queries.push(params.sql);
      return Promise.resolve({
        columnNames: [],
        columnTypes: [],
        rows: [],
      });
    },
    executeRaw(params: { sql: string; args?: unknown[] }) {
      executions.push(params.sql);
      return Promise.resolve(0);
    },
    async startTransaction() {
      return {
        queryRaw(params: { sql: string; args?: unknown[] }) {
          queries.push(params.sql);
          return Promise.resolve({
            columnNames: [],
            columnTypes: [],
            rows: [],
          });
        },
        executeRaw(params: { sql: string; args?: unknown[] }) {
          executions.push(params.sql);
          return Promise.resolve(0);
        },
        commit() {
          return Promise.resolve();
        },
        rollback() {
          return Promise.resolve();
        },
      };
    },
  };

  return { adapter, queries, executions };
}

test("wrapAdapter appends sqlcommenter tags to queryRaw", async () => {
  const { adapter, queries } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  await queryContextAls.run({ queryStack: ["/app/src/routes/users.ts:42:10"] }, async () => {
    await wrapped.queryRaw({ sql: 'SELECT "id", "name" FROM "users" WHERE "id" = $1', args: [1] });
  });

  assert.strictEqual(queries.length, 1);
  assert.match(queries[0], /^SELECT "id", "name" FROM "users" WHERE "id" = \$1\/\*/);
  assert.match(queries[0], /db_driver='prisma'/);
  assert.match(queries[0], /file='/);
  assert.match(queries[0], /\*\/$/);
});

test("wrapAdapter appends sqlcommenter tags to executeRaw", async () => {
  const { adapter, executions } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  await queryContextAls.run({ queryStack: ["/app/src/routes/users.ts:50:5"] }, async () => {
    await wrapped.executeRaw({ sql: 'UPDATE "users" SET "name" = $1 WHERE "id" = $2', args: ["Alice", 1] });
  });

  assert.strictEqual(executions.length, 1);
  assert.match(executions[0], /^UPDATE "users" SET "name" = \$1 WHERE "id" = \$2\/\*/);
  assert.match(executions[0], /db_driver='prisma'/);
});

test("wrapAdapter does not add comment when no ALS context", async () => {
  const { adapter, queries } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  // No queryContextAls.run — simulates BEGIN/COMMIT issued by engine
  await wrapped.queryRaw({ sql: "BEGIN" });

  assert.strictEqual(queries.length, 1);
  // Should still have db_driver tag (always present) but no file tag
  assert.match(queries[0], /db_driver='prisma'/);
  assert.ok(!queries[0].includes("file="));
});

test("wrapAdapter includes request context (route, method) in tags", async () => {
  const { adapter, queries } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  await requestContextAls.run({ route: "/users", method: "GET" }, async () => {
    await queryContextAls.run({ queryStack: ["/app/src/routes/users.ts:42:10"] }, async () => {
      await wrapped.queryRaw({ sql: 'SELECT * FROM "users"' });
    });
  });

  assert.strictEqual(queries.length, 1);
  assert.match(queries[0], /route='%2Fusers'/);
  assert.match(queries[0], /method='GET'/);
});

test("wrapAdapter wraps transaction queries", async () => {
  const { adapter, queries } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  await queryContextAls.run({ queryStack: ["/app/src/routes/users.ts:60:3"] }, async () => {
    const tx = await wrapped.startTransaction();
    await tx.queryRaw({ sql: 'SELECT * FROM "users" FOR UPDATE' });
    await tx.commit();
  });

  assert.strictEqual(queries.length, 1);
  assert.match(queries[0], /db_driver='prisma'/);
  assert.match(queries[0], /file='/);
});

test("wrapAdapter skips SQL that already has a comment", async () => {
  const { adapter, queries } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  const sqlWithComment = 'SELECT * FROM "users" /* existing comment */';
  await queryContextAls.run({ queryStack: ["/app/src/file.ts:1:1"] }, async () => {
    await wrapped.queryRaw({ sql: sqlWithComment });
  });

  assert.strictEqual(queries.length, 1);
  assert.strictEqual(queries[0], sqlWithComment);
});

test("sqlcommenterExtension sets queryStack in ALS", async () => {
  const ext = sqlcommenterExtension();

  let capturedContext: { queryStack: string[] } | undefined;

  // Simulate what Prisma does: call the $allOperations handler
  const handler = ext.query.$allModels.$allOperations;
  await handler({
    args: {},
    query: async (args: unknown) => {
      capturedContext = queryContextAls.getStore();
      return {};
    },
  });

  assert.ok(capturedContext, "queryContextAls should have a store");
  assert.ok(Array.isArray(capturedContext!.queryStack), "queryStack should be an array");
});

test("tags are sorted alphabetically", async () => {
  const { adapter, queries } = createMockAdapter();
  const wrapped = wrapAdapter(adapter);

  await requestContextAls.run({ route: "/users", method: "GET" }, async () => {
    await queryContextAls.run({ queryStack: ["/app/src/routes/users.ts:42:10"] }, async () => {
      await wrapped.queryRaw({ sql: "SELECT 1" });
    });
  });

  assert.strictEqual(queries.length, 1);
  // Extract the comment portion
  const comment = queries[0].replace("SELECT 1", "");
  // Verify it starts with /* and ends with */
  assert.match(comment, /^\/\*.*\*\/$/);
  // Extract key=value pairs
  const inner = comment.slice(2, -2);
  const pairs = inner.split(",").map((p) => p.split("=")[0]);
  const sorted = [...pairs].sort();
  assert.deepStrictEqual(pairs, sorted, "Tags should be sorted alphabetically");
});
