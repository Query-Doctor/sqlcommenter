import { test } from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { patchDrizzle } from "../src/index.js";
import { sqlcommenterFastify } from "../src/fastify.js";

const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
const items = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

function tag(sql: string, key: string): string | undefined {
  const match = sql.match(new RegExp(`${key}='([^']*)'`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function setup() {
  const logged: string[] = [];
  const db = patchDrizzle(
    drizzle({
      schema: { sessions, items },
      logger: { logQuery: (query) => logged.push(query) },
    }),
  );
  await db.$client.exec(
    "CREATE TABLE sessions(id serial primary key, name text); CREATE TABLE items(id serial primary key, name text);",
  );
  return { db, logged };
}

// The plugin must (a) apply globally — covering routes registered in the parent scope, which a
// plain encapsulated `register` would silently miss — and (b) cover the whole request lifecycle,
// so a query issued in an auth plugin's own `onRequest` (registered after it) is tagged too, not
// just queries in the route handler.
test("fastify plugin tags lifecycle-wide queries with route and method", async () => {
  const { db, logged } = await setup();
  const app = Fastify();
  await app.register(sqlcommenterFastify);
  // Auth-style session lookup in its own onRequest hook, registered after the plugin.
  app.addHook("onRequest", async () => {
    await db.select().from(sessions);
  });
  app.get("/items/:id", async () => {
    await db.select().from(items);
    return { ok: true };
  });

  const res = await app.inject({ method: "GET", url: "/items/42" });
  await app.close();

  assert.strictEqual(res.statusCode, 200);
  const sessionSql = logged.find((q) => q.includes('from "sessions"'));
  const itemSql = logged.find((q) => q.includes('from "items"'));
  assert.ok(sessionSql, "expected the auth onRequest query to run");
  assert.ok(itemSql, "expected the handler query to run");

  // onRequest-phase query (the case a handler wrap misses).
  assert.strictEqual(tag(sessionSql, "route"), "/items/:id");
  assert.strictEqual(tag(sessionSql, "method"), "GET");
  // handler-phase query.
  assert.strictEqual(tag(itemSql, "route"), "/items/:id");
  assert.strictEqual(tag(itemSql, "method"), "GET");
});

test("fastify plugin merges extra context fields", async () => {
  const { db, logged } = await setup();
  const app = Fastify();
  await app.register(sqlcommenterFastify, {
    context: (request) => ({ controller: "items", host: request.headers.host }),
  });
  app.get("/items/:id", async () => {
    await db.select().from(items);
    return { ok: true };
  });

  await app.inject({ method: "GET", url: "/items/42", headers: { host: "x" } });
  await app.close();

  const itemSql = logged.find((q) => q.includes('from "items"'))!;
  assert.strictEqual(tag(itemSql, "route"), "/items/:id");
  assert.strictEqual(tag(itemSql, "controller"), "items");
  assert.strictEqual(tag(itemSql, "host"), "x");
});
