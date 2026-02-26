import { test } from "node:test";
import assert from "node:assert";
import { patchMikroORM, traceCaller } from "../src/index.js";

// Mock MikroORM's config interface to test without a real database driver.
// This tests the actual onQuery function that patchMikroORM sets up.
function createMockOrm() {
  let onQuery: (sql: string, params: readonly unknown[]) => string = (sql) => sql;
  return {
    config: {
      get(_key: "onQuery") {
        return onQuery;
      },
      set(_key: "onQuery", value: (sql: string, params: readonly unknown[]) => string) {
        onQuery = value;
      },
    },
    // helper to run a query through the onQuery pipeline
    executeQuery(sql: string, params: readonly unknown[] = []): string {
      return onQuery(sql, params);
    },
  };
}

test("patchMikroORM appends sqlcommenter tags to queries", () => {
  const orm = createMockOrm();
  patchMikroORM(orm);

  const result = orm.executeQuery("SELECT 1 as result", []);
  assert.match(result, /^SELECT 1 as result\/\*/);
  assert.match(result, /db_driver='mikroorm'/);
  assert.match(result, /file='[^']+'/);
  assert.match(result, /\*\/$/);
});

test("patchMikroORM includes db_driver tag", () => {
  const orm = createMockOrm();
  patchMikroORM(orm);

  const result = orm.executeQuery("SELECT * FROM users", []);
  assert.match(result, /db_driver='mikroorm'/);
});

test("patchMikroORM includes file tag with caller location", () => {
  const orm = createMockOrm();
  patchMikroORM(orm);

  const result = orm.executeQuery("SELECT * FROM users", []);
  // file tag should contain a .ts or .spec.ts file path with line:column
  assert.match(result, /file='[^']*\.ts%3A\d+%3A\d+'/);
});

test("patchMikroORM skips queries with trailing comments", () => {
  const orm = createMockOrm();
  patchMikroORM(orm);

  const sql = "SELECT 1 /*db_driver='something'*/";
  const result = orm.executeQuery(sql, []);
  // should not double-append
  assert.strictEqual(result, sql);
  const commentCount = (result.match(/db_driver/g) || []).length;
  assert.strictEqual(commentCount, 1, "Should not add another comment when trailing tags exist");
});

test("patchMikroORM chains existing onQuery handler", () => {
  const orm = createMockOrm();

  // simulate user having an existing onQuery
  orm.config.set("onQuery", (sql: string) => sql + " /* user-tag */");

  patchMikroORM(orm);

  const result = orm.executeQuery("SELECT 1", []);
  // existing onQuery appends "/* user-tag */" which ends with "*/"
  // so our sqlcommenter should detect the trailing comment and skip
  assert.ok(
    result.includes("/* user-tag */"),
    "Existing onQuery handler output should be preserved",
  );
});

test("patchMikroORM chains existing onQuery and appends when no trailing comment", () => {
  const orm = createMockOrm();

  // simulate user having an existing onQuery that adds a prefix, not a trailing comment
  orm.config.set("onQuery", (sql: string) => "/* hint */ " + sql);

  patchMikroORM(orm);

  const result = orm.executeQuery("SELECT 1", []);
  // should have both the user's prefix hint and our appended sqlcommenter tags
  assert.ok(result.startsWith("/* hint */"), "Existing onQuery prefix should be preserved");
  assert.match(result, /db_driver='mikroorm'/);
});

test("patchMikroORM preserves original SQL content", () => {
  const orm = createMockOrm();
  patchMikroORM(orm);

  const originalSql = "SELECT id, name FROM users WHERE id = $1";
  const result = orm.executeQuery(originalSql, [42]);
  assert.ok(
    result.startsWith(originalSql),
    "Original SQL should be preserved at the start of the result",
  );
});

test("traceCaller returns a file path with line and column", () => {
  const caller = traceCaller();
  assert.ok(caller, "traceCaller should return a value");
  assert.match(caller!, /:\d+:\d+$/, "Should end with :line:column");
});
