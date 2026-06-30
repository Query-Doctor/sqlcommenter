import { test } from "node:test";
import assert from "node:assert";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { patchDrizzle, traceCaller } from "../src/index.js";

// --- Unit: symbol capture straight from the stack frame ---------------------
// Test files are whitelisted by `isValidCaller`, so `traceCaller()` selects the
// frame of whatever test-file function calls it.

function namedFunction() {
  return traceCaller();
}
const arrowAssigned = () => traceCaller();
const repo = {
  findFavorites() {
    return traceCaller();
  },
};

test("captures the enclosing named function as symbol, with file", () => {
  const caller = namedFunction();
  assert.ok(caller?.file, "file must always be captured");
  assert.strictEqual(caller?.symbol, "namedFunction");
});

test("captures an object method as Object.<method>", () => {
  assert.strictEqual(repo.findFavorites()?.symbol, "Object.findFavorites");
});

test("captures an arrow assigned to a const by its inferred name", () => {
  assert.strictEqual(arrowAssigned()?.symbol, "arrowAssigned");
});

test("omits the symbol for an anonymous frame but keeps file", () => {
  // An immediately-invoked anonymous arrow has no stable name in V8.
  const caller = ((): ReturnType<typeof traceCaller> => traceCaller())();
  assert.ok(caller?.file, "file is still captured as the fallback");
  assert.strictEqual(caller?.symbol, undefined);
});

// --- Integration: the tag actually lands in the emitted comment -------------

const watches = pgTable("watches", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
const notifs = pgTable("notifs", {
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
      schema: { watches, notifs },
      logger: { logQuery: (query) => logged.push(query) },
    }),
  );
  await db.$client.exec(
    "CREATE TABLE watches (id serial primary key, name text); CREATE TABLE notifs (id serial primary key, name text);",
  );
  return { db, logged };
}

test("emits func_name alongside file for a named caller", async () => {
  const { db, logged } = await setupLoggedDb();
  async function loadWatches() {
    return db.select().from(watches);
  }
  await loadWatches();

  const sql = logged.find((q) => q.includes('from "watches"'))!;
  assert.strictEqual(tag(sql, "func_name"), "loadWatches");
  assert.ok(tag(sql, "file"), "file is still emitted");
  // serializeTags sorts keys alphabetically: db_driver, file, func_name.
  assert.ok(
    sql.indexOf("file=") < sql.indexOf("func_name="),
    "file precedes func_name in the sorted comment",
  );
});

test("omits func_name (but keeps file) when the caller is anonymous", async () => {
  const { db, logged } = await setupLoggedDb();
  // The query is built directly in this anonymous async arrow.
  await (async () => {
    await db.select().from(watches);
  })();

  const sql = logged.find((q) => q.includes('from "watches"'))!;
  assert.strictEqual(tag(sql, "func_name"), undefined);
  assert.ok(tag(sql, "file"), "file is still emitted as the fallback");
});

test("concurrent queries each keep their own func_name", async () => {
  const { db, logged } = await setupLoggedDb();
  async function queryWatches() {
    return db.select().from(watches);
  }
  async function queryNotifs() {
    return db.select().from(notifs);
  }
  await Promise.all([queryWatches(), queryNotifs()]);

  const watchesSql = logged.find((q) => q.includes('from "watches"'))!;
  const notifsSql = logged.find((q) => q.includes('from "notifs"'))!;
  assert.strictEqual(tag(watchesSql, "func_name"), "queryWatches");
  assert.strictEqual(tag(notifsSql, "func_name"), "queryNotifs");
});
