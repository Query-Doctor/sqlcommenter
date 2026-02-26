import { test } from "node:test";
import assert from "node:assert";
import { MikroORM, EntitySchema } from "@mikro-orm/core";
import { BetterSqliteDriver } from "@mikro-orm/better-sqlite";
import { patchMikroORM } from "../src/index.js";
import { withRequestContext } from "../src/http.js";

const UserSchema = new EntitySchema({
  name: "User",
  tableName: "users",
  properties: {
    id: { type: "number", primary: true },
    name: { type: "string" },
  },
});

async function createOrm() {
  return MikroORM.init({
    driver: BetterSqliteDriver,
    dbName: ":memory:",
    entities: [UserSchema],
    allowGlobalContext: true,
  });
}

// Wraps the onQuery to capture all transformed SQL that passes through it
function captureQueries(orm: MikroORM): string[] {
  const captured: string[] = [];
  const currentOnQuery = orm.config.get("onQuery");
  orm.config.set("onQuery", (sql: string, params: readonly unknown[]) => {
    const result = currentOnQuery(sql, params);
    captured.push(result);
    return result;
  });
  return captured;
}

test("sqlite: tags appended to raw em.execute()", async () => {
  const orm = patchMikroORM(await createOrm());
  await orm.getSchemaGenerator().createSchema();
  const captured = captureQueries(orm);

  const result = await orm.em.execute("SELECT 42 as answer");
  assert.deepStrictEqual(result, [{ answer: 42 }]);

  const tagged = captured.find((q) => q.includes("SELECT 42") && q.includes("db_driver"));
  assert.ok(tagged, `Expected tagged query, got: ${captured.join("\n")}`);
  assert.match(tagged!, /db_driver='mikroorm'/);
  assert.match(tagged!, /file='[^']+'/);

  await orm.close();
});

test("sqlite: tags appended to entity find", async () => {
  const orm = patchMikroORM(await createOrm());
  await orm.getSchemaGenerator().createSchema();
  await orm.em.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')");
  await orm.em.execute("INSERT INTO users (id, name) VALUES (2, 'Bob')");

  const captured = captureQueries(orm);

  const em = orm.em.fork();
  const users = await em.find("User", {});
  assert.strictEqual(users.length, 2);

  const tagged = captured.find((q) => q.includes("users") && q.includes("db_driver"));
  assert.ok(tagged, `Expected tagged SELECT, got: ${captured.join("\n")}`);
  assert.match(tagged!, /db_driver='mikroorm'/);

  await orm.close();
});

test("sqlite: tags appended to entity findOne", async () => {
  const orm = patchMikroORM(await createOrm());
  await orm.getSchemaGenerator().createSchema();
  await orm.em.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')");

  const captured = captureQueries(orm);

  const em = orm.em.fork();
  const user = await em.findOne("User", { name: "Alice" });
  assert.ok(user);
  assert.strictEqual(user!.name, "Alice");

  const tagged = captured.find((q) => q.includes("users") && q.includes("db_driver"));
  assert.ok(tagged, `Expected tagged SELECT, got: ${captured.join("\n")}`);

  await orm.close();
});

test("sqlite: tags appended to entity persist + flush", async () => {
  const orm = patchMikroORM(await createOrm());
  await orm.getSchemaGenerator().createSchema();

  const captured = captureQueries(orm);

  const em = orm.em.fork();
  em.create("User", { id: 1, name: "Charlie" });
  await em.flush();

  const tagged = captured.find((q) => q.includes("insert") && q.includes("db_driver"));
  assert.ok(tagged, `Expected tagged INSERT, got: ${captured.join("\n")}`);
  assert.match(tagged!, /db_driver='mikroorm'/);

  await orm.close();
});

test("sqlite: tags appended to QueryBuilder", async () => {
  const orm = patchMikroORM(await createOrm());
  await orm.getSchemaGenerator().createSchema();
  await orm.em.execute("INSERT INTO users (id, name) VALUES (1, 'Dave')");

  const captured = captureQueries(orm);

  const em = orm.em.fork();
  const result = await em.createQueryBuilder("User").select("*").where({ name: "Dave" }).execute();
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, "Dave");

  const tagged = captured.find((q) => q.includes("users") && q.includes("db_driver"));
  assert.ok(tagged, `Expected tagged QueryBuilder SELECT, got: ${captured.join("\n")}`);

  await orm.close();
});

test("sqlite: withRequestContext adds route/method/controller tags", async () => {
  const orm = patchMikroORM(await createOrm());
  await orm.getSchemaGenerator().createSchema();
  await orm.em.execute("INSERT INTO users (id, name) VALUES (1, 'Eve')");

  const captured = captureQueries(orm);

  await new Promise<void>((resolve) => {
    withRequestContext(
      { route: "/api/users", method: "GET", controller: "UserController" },
      async () => {
        const em = orm.em.fork();
        await em.find("User", {});
        resolve();
      },
    );
  });

  const tagged = captured.find((q) => q.includes("users") && q.includes("route"));
  assert.ok(tagged, `Expected tagged SELECT with route, got: ${captured.join("\n")}`);
  assert.ok(tagged!.includes("route='%2Fapi%2Fusers'"), "Should have URL-encoded route");
  assert.ok(tagged!.includes("method='GET'"), "Should have method");
  assert.ok(tagged!.includes("controller='UserController'"), "Should have controller");

  await orm.close();
});
