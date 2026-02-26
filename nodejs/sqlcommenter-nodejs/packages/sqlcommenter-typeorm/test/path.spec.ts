import { test } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  findProjectRoot,
  resolveFilePath,
  applyWslPrefix,
  _resetProjectRootCache,
} from "../src/path.js";

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

test("resolveFilePath", async (t) => {
  t.afterEach(() => {
    _resetProjectRootCache();
  });

  await t.test("resolves path with src/ to project root", () => {
    const projectRoot = findProjectRoot();
    const result = resolveFilePath(
      "/wrong/deploy/dir/src/routes/admin.ts:12:15",
    );
    assert.strictEqual(result, `${projectRoot}/src/routes/admin.ts:12:15`);
  });

  await t.test("leaves path without src/ unchanged", () => {
    const result = resolveFilePath("/some/other/path/routes/admin.ts:5:10");
    assert.strictEqual(result, "/some/other/path/routes/admin.ts:5:10");
  });

  await t.test("preserves line:column suffix", () => {
    const projectRoot = findProjectRoot();
    const result = resolveFilePath("/bad/path/src/index.ts:99:3");
    assert.strictEqual(result, `${projectRoot}/src/index.ts:99:3`);
  });

  await t.test("uses first src/ occurrence", () => {
    const projectRoot = findProjectRoot();
    const result = resolveFilePath(
      "/deploy/src/nested/src/routes/admin.ts:1:1",
    );
    assert.strictEqual(
      result,
      `${projectRoot}/src/nested/src/routes/admin.ts:1:1`,
    );
  });

  await t.test("returns raw string if no line:column suffix", () => {
    const result = resolveFilePath("/some/path/src/file.ts");
    assert.strictEqual(result, "/some/path/src/file.ts");
  });
});

test("applyWslPrefix", async (t) => {
  const originalWslDistro = process.env.WSL_DISTRO_NAME;

  t.afterEach(() => {
    if (originalWslDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = originalWslDistro;
    }
  });

  await t.test("prefixes path when WSL_DISTRO_NAME is set", () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    const result = applyWslPrefix("/home/user/project/src/index.ts");
    assert.strictEqual(
      result,
      "//wsl.localhost/Ubuntu/home/user/project/src/index.ts",
    );
  });

  await t.test("returns path unchanged when WSL_DISTRO_NAME is not set", () => {
    delete process.env.WSL_DISTRO_NAME;
    const result = applyWslPrefix("/home/user/project/src/index.ts");
    assert.strictEqual(result, "/home/user/project/src/index.ts");
  });
});

test("resolveFilePath with WSL", async (t) => {
  const originalWslDistro = process.env.WSL_DISTRO_NAME;

  t.afterEach(() => {
    _resetProjectRootCache();
    if (originalWslDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = originalWslDistro;
    }
  });

  await t.test("applies WSL prefix to resolved src/ paths", () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    const projectRoot = findProjectRoot();
    const result = resolveFilePath("/wrong/path/src/routes/admin.ts:12:15");
    assert.strictEqual(
      result,
      `//wsl.localhost/Ubuntu${projectRoot}/src/routes/admin.ts:12:15`,
    );
  });
});
