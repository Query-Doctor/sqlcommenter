import { test } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot, _resetProjectRootCache } from "../src/path.js";

test("findProjectRoot", async (t) => {
  t.afterEach(() => {
    _resetProjectRootCache();
  });

  await t.test("returns a directory containing tsconfig.json", () => {
    const root = findProjectRoot();
    assert.ok(
      existsSync(join(root, "tsconfig.json")),
      `Expected ${root} to contain tsconfig.json`,
    );
  });

  await t.test("caches the result across calls", () => {
    const first = findProjectRoot();
    const second = findProjectRoot();
    assert.strictEqual(first, second);
  });
});
