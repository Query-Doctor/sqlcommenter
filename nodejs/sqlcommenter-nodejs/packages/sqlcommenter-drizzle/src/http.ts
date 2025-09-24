import { als } from "./als.js";
import type { RequestContext } from "./request-context.js";

/**
 * Wraps the next function in the AsyncLocalStorage with the request context.
 * Used to get `route` and `controller` information from the request into the query
 * without exposing the underlying AsyncLocalStorage API.
 */
export function withRequestContext(
  context: RequestContext,
  next: () => Promise<unknown>,
) {
  als.run(context, next);
}

export type { RequestContext, WellKnownFields } from "./request-context.js";
