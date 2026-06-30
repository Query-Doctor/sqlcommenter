import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
} from "fastify";
import { als } from "./als.js";
import type { RequestContext } from "./request-context.js";

export type SqlcommenterContextFn = (
  request: FastifyRequest,
) => Record<string, unknown>;

export interface SqlcommenterFastifyOptions {
  /**
   * Extra fields to add to every query's context, merged over the default `route`/`method`
   * (e.g. a tenant id, or the matched controller name). Runs once per request in `onRequest`.
   */
  context?: SqlcommenterContextFn;
}

// fastify-plugin sets this symbol so a plugin's hooks/decorators apply to the *parent* scope
// rather than being encapsulated in the plugin's own scope. Our `onRequest` hook has to be
// global so it covers routes — and other plugins' hooks — registered in the parent scope.
// Without it, a plain `register()` silently encapsulates the hook and it tags nothing. This is
// the same primitive `fastify-plugin` relies on, inlined so the integration needs no dependency
// beyond fastify itself.
const SKIP_OVERRIDE = Symbol.for("skip-override");

const plugin: FastifyPluginCallback<SqlcommenterFastifyOptions> = (
  fastify: FastifyInstance,
  options: SqlcommenterFastifyOptions,
  done: (err?: Error) => void,
) => {
  fastify.addHook("onRequest", (request, _reply, next) => {
    const context: RequestContext = {
      // `routeOptions.url` is the matched route pattern (e.g. "/items/:id"). It's resolved by the
      // time `onRequest` runs; fall back to the raw url for unmatched requests.
      route: request.routeOptions?.url ?? request.url,
      method: request.method,
      ...options.context?.(request),
    };
    // Opening the context here — and registering this plugin before any query-issuing plugin —
    // means queries from later `onRequest`/`preHandler` hooks and the handler all inherit it,
    // not just the handler body.
    als.run(context, next);
  });
  done();
};

(plugin as unknown as Record<symbol, boolean>)[SKIP_OVERRIDE] = true;

/**
 * Fastify plugin that tags every query issued during a request with its `route` and `method`
 * (plus anything returned by `options.context`).
 *
 * Register it **before** any other plugin whose hooks issue queries (e.g. an auth plugin that
 * resolves a session in its own `onRequest`/`preHandler`), so the context is already open when
 * those hooks run. Because it hooks `onRequest`, it covers the whole request lifecycle — not
 * just the route handler.
 *
 * @example
 * ```ts
 * import { sqlcommenterFastify } from "@query-doctor/sqlcommenter-mikroorm/fastify";
 *
 * await app.register(sqlcommenterFastify);
 * await app.register(authPlugin); // queries issued in auth's hooks are tagged too
 * ```
 */
export const sqlcommenterFastify = plugin;
export default sqlcommenterFastify;

export type { RequestContext } from "./request-context.js";
