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
