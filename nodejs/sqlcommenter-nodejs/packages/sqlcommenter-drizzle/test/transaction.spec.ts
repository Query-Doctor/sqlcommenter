import { test } from "node:test";
import assert from "node:assert";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { patchDrizzle } from "../src/index.js";

const t = pgTable("t", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
const u = pgTable("u", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

function tag(sql: string, key: string): string | undefined {
  const match = sql.match(new RegExp(`${key}='([^']*)'`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function setupLoggedDb() {
  const logged: string[] = [];
  const db = patchDrizzle(
    drizzle({
      schema: { t, u },
      logger: { logQuery: (query) => logged.push(query) },
    }),
  );
  await db.$client.exec(
    "CREATE TABLE t (id serial primary key, name text); CREATE TABLE u (id serial primary key, name text);",
  );
  return { db, logged };
}

// `patchDrizzle` patches the top-level db, but `db.transaction(cb)` hands `cb` a fresh `tx` whose
// methods are unpatched — so without wrapping the transaction, queries built inside it lose their
// `file` tag (only `db_driver`, added in prepareQuery, would survive).
test("queries inside a transaction still get a file tag", async () => {
  const { db, logged } = await setupLoggedDb();
  await db.transaction(async (tx) => {
    await tx.insert(t).values({ name: "a" });
  });

  const sql = logged.find((q) => q.includes('into "t"'))!;
  assert.match(
    tag(sql, "file") ?? "",
    /:\d+:\d+$/,
    "file must be captured inside a transaction",
  );
  // The direct caller here is an anonymous transaction arrow, so there is no symbol.
  assert.strictEqual(tag(sql, "func_name"), undefined);
});

test("a named transaction callback carries its func_name", async () => {
  const { db, logged } = await setupLoggedDb();
  async function persistThing(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    await tx.insert(t).values({ name: "a" });
  }
  await db.transaction(persistThing);

  const sql = logged.find((q) => q.includes('into "t"'))!;
  assert.ok(tag(sql, "file"), "file is always captured");
  assert.strictEqual(tag(sql, "func_name"), "persistThing");
});

test("nested (savepoint) transactions are tagged too", async () => {
  const { db, logged } = await setupLoggedDb();
  await db.transaction(async (tx) => {
    await tx.transaction(async (tx2) => {
      await tx2.insert(u).values({ name: "n" });
    });
  });

  const sql = logged.find((q) => q.includes('into "u"'))!;
  assert.ok(
    /:\d+:\d+$/.test(tag(sql, "file") ?? ""),
    "file must be captured inside a nested transaction",
  );
});

test("wrapping the transaction preserves commit semantics", async () => {
  const { db } = await setupLoggedDb();
  await db.transaction(async (tx) => {
    await tx.insert(t).values({ name: "committed" });
  });
  const rows = await db.select().from(t).where(eq(t.name, "committed"));
  assert.strictEqual(rows.length, 1);
});

test("wrapping the transaction preserves rollback semantics", async () => {
  const { db } = await setupLoggedDb();
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.insert(t).values({ name: "rolledback" });
      throw new Error("boom");
    }),
    /boom/,
  );
  const rows = await db.select().from(t).where(eq(t.name, "rolledback"));
  assert.strictEqual(rows.length, 0, "the errored transaction must roll back");
});

// Named callbacks passed straight to `transaction` give each concurrent tx a distinct symbol,
// so this asserts the per-query caller isn't clobbered across concurrent transactions.
test("concurrent transactions each keep their own caller", async () => {
  const { db, logged } = await setupLoggedDb();
  async function txIntoT(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    await tx.insert(t).values({ name: "A" });
  }
  async function txIntoU(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    await tx.insert(u).values({ name: "B" });
  }
  await Promise.all([db.transaction(txIntoT), db.transaction(txIntoU)]);

  const tSql = logged.find((q) => q.includes('into "t"'))!;
  const uSql = logged.find((q) => q.includes('into "u"'))!;
  assert.strictEqual(tag(tSql, "func_name"), "txIntoT");
  assert.strictEqual(tag(uSql, "func_name"), "txIntoU");
});
