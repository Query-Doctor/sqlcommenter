import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "./request-context.js";

export type QueryContext = {
  queryStack: string[];
};

/** Stores the caller stack trace captured by the Prisma Client extension */
export const queryContextAls = new AsyncLocalStorage<QueryContext>();

/** Stores HTTP request context (route, method, etc.) set by middleware */
export const requestContextAls = new AsyncLocalStorage<RequestContext>();

/**
 * Fallback context bridge for Prisma's WASM engine boundary.
 *
 * AsyncLocalStorage context is lost when Prisma's Rust/WASM query engine
 * calls back into the JS driver adapter. The extension (which runs BEFORE
 * the WASM boundary) snapshots context here so the adapter (which runs
 * AFTER the boundary) can read it.
 */
export let bridgedQueryContext: QueryContext | undefined;
export let bridgedRequestContext: RequestContext | undefined;

export function setBridgedContext(
  query: QueryContext | undefined,
  request: RequestContext | undefined,
) {
  bridgedQueryContext = query;
  bridgedRequestContext = request;
}

export function clearBridgedContext() {
  bridgedQueryContext = undefined;
  bridgedRequestContext = undefined;
}
