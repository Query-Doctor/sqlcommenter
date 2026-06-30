import { test } from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import { sqlcommenterFastify } from "../src/fastify.js";
import { als } from "../src/als.js";

// The plugin is driver-agnostic — it only opens the shared AsyncLocalStorage context that the
// query patch reads. These tests assert that context directly, so they don't need a real ORM.

// It must apply globally (covering parent-scope routes a plain encapsulated register would miss)
// and cover the whole lifecycle, so an onRequest hook registered after it still sees the context.
test("fastify plugin exposes route/method context lifecycle-wide", async () => {
  const seen: Record<string, unknown>[] = [];
  const app = Fastify();
  await app.register(sqlcommenterFastify);
  app.addHook("onRequest", async () => {
    const store = als.getStore();
    if (store) seen.push({ phase: "onRequest", ...store });
  });
  app.get("/items/:id", async () => {
    const store = als.getStore();
    if (store) seen.push({ phase: "handler", ...store });
    return { ok: true };
  });

  const res = await app.inject({ method: "GET", url: "/items/42" });
  await app.close();

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(seen, [
    { phase: "onRequest", route: "/items/:id", method: "GET" },
    { phase: "handler", route: "/items/:id", method: "GET" },
  ]);
});

test("fastify plugin merges extra context fields", async () => {
  let store: Record<string, unknown> | undefined;
  const app = Fastify();
  await app.register(sqlcommenterFastify, {
    context: (request) => ({ controller: "items", host: request.headers.host }),
  });
  app.get("/items/:id", async () => {
    store = als.getStore();
    return { ok: true };
  });

  await app.inject({ method: "GET", url: "/items/42", headers: { host: "x" } });
  await app.close();

  assert.deepStrictEqual(store, {
    route: "/items/:id",
    method: "GET",
    controller: "items",
    host: "x",
  });
});
