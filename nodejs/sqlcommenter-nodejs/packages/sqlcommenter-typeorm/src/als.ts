import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "./request-context.js";

export const als = new AsyncLocalStorage<RequestContext>({
  name: "request-context",
});
