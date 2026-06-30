import { als } from "./als.js";
import type { RequestContext } from "./request-context.js";

/**
 * Runs `next` within an AsyncLocalStorage scope carrying the request context, so any query
 * issued during it picks up `route` (and any other provided fields such as `method` and
 * `controller`) without exposing the underlying AsyncLocalStorage API.
 *
 * `next` is invoked for its side effect and its return value is ignored, so the parameter
 * accepts any nullary callback — including framework hook callbacks like Fastify's
 * `done: (err?: Error) => void` or Express's `next`.
 */
export function withRequestContext(context: RequestContext, next: () => unknown) {
  als.run(context, next);
}

export type { RequestContext, WellKnownFields } from "./request-context.js";
