import { queryContextAls, requestContextAls, setBridgedContext, clearBridgedContext } from "./als.js";
import { traceCaller } from "./path-trace.js";

type HookArgs = { args: unknown; query: (args: unknown) => Promise<unknown> };

/**
 * Wraps a Prisma query call, capturing the caller stack and bridging
 * both query and request ALS context across Prisma's WASM engine boundary.
 */
function withContext({ args, query }: HookArgs): Promise<unknown> {
  const caller = traceCaller();
  const queryCtx = { queryStack: caller ? [caller] : [] };
  const requestCtx = requestContextAls.getStore();

  // Bridge context so the adapter can read it after the WASM boundary
  setBridgedContext(queryCtx, requestCtx);

  return queryContextAls.run(queryCtx, () => query(args)).finally(clearBridgedContext);
}

/**
 * Prisma Client extension that captures the call stack at the user's code
 * and bridges context across the WASM engine boundary for the adapter
 * wrapper to read.
 *
 * Usage:
 *   const prisma = new PrismaClient({ adapter }).$extends(sqlcommenterExtension())
 */
export function sqlcommenterExtension() {
  return {
    query: {
      $allModels: {
        $allOperations: withContext,
      },
      $queryRaw: withContext,
      $executeRaw: withContext,
      $queryRawUnsafe: withContext,
      $executeRawUnsafe: withContext,
    },
  };
}
