import { test } from "node:test";
import { pgTable } from "drizzle-orm/pg-core";
import { serial } from "drizzle-orm/pg-core";
import { text } from "drizzle-orm/pg-core";
import { patchDrizzle } from "../src/index.js";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleQueryError } from "drizzle-orm";
import assert from "node:assert";

const myTable = pgTable("my_table", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

test("pglite integration", async () => {
  const db = patchDrizzle(drizzle());
  let errored = false;
  try {
    await db.select().from(myTable);
  } catch (err) {
    if (err instanceof DrizzleQueryError) {
      errored = true;
      console.log(err.query);
      assert.match(err.query, /\.ts%3A(\d+)%3A(\d+)'\*\/$/);
    }
  }
  if (!errored) {
    assert.fail("Expected an error to be thrown");
  }
});

const watches = pgTable("watches", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
const notifs = pgTable("notifs", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

function fileTag(sql: string): string | undefined {
  const match = sql.match(/file='([^']*)'/);
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

// Regression: a single drizzle() instance shares one session across every query, so keying the
// captured caller by the session dropped/clobbered the `file` tag whenever two queries were built
// before either executed (concurrent requests, `Promise.all`). Each query must carry its own tag.
test("concurrent queries each keep their own file tag", async () => {
  const { db, logged } = await setupLoggedDb();
  const queryWatches = () => db.select().from(watches);
  const queryNotifs = () => db.select().from(notifs);

  await Promise.all([queryWatches(), queryNotifs()]);

  const watchesSql = logged.find((q) => q.includes('from "watches"'));
  const notifsSql = logged.find((q) => q.includes('from "notifs"'));
  assert.ok(watchesSql, "expected the watches query to be logged");
  assert.ok(notifsSql, "expected the notifs query to be logged");

  const watchesFile = fileTag(watchesSql);
  const notifsFile = fileTag(notifsSql);
  assert.ok(watchesFile, "watches query is missing its file tag");
  assert.ok(notifsFile, "notifs query is missing its file tag");
  // Distinct build sites must produce distinct tags — not one joined tag plus a dropped one.
  assert.notStrictEqual(
    watchesFile,
    notifsFile,
    "concurrent queries clobbered each other's file tag",
  );
  assert.doesNotMatch(
    watchesFile!,
    /;/,
    "file tag must hold a single caller, not a joined stack",
  );
});

// Queries can be built in one order and awaited in another; the tag must follow the query object,
// not the order in which queries reach the driver.
test("file tag follows the query even when awaited out of build order", async () => {
  const { db, logged } = await setupLoggedDb();
  const built1 = db.select().from(watches);
  const built2 = db.select().from(notifs);
  await built2;
  await built1;

  const watchesFile = fileTag(logged.find((q) => q.includes('from "watches"'))!);
  const notifsFile = fileTag(logged.find((q) => q.includes('from "notifs"'))!);
  assert.ok(watchesFile && notifsFile, "both queries must keep a file tag");
  assert.notStrictEqual(watchesFile, notifsFile);
});
