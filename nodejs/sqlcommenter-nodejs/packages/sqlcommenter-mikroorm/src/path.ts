import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

let cachedProjectRoot: string | undefined;

/**
 * Finds the project root by walking up from `process.cwd()` looking for `tsconfig.json`.
 *
 * In deployed environments, `process.cwd()` may not be the project root
 * (e.g., `cd .amplify-hosting/compute/default/ && node app.js`).
 * Walking up to find `tsconfig.json` — which is never copied to deployment directories —
 * gives us the real project root.
 *
 * The result is cached since the project root doesn't change during a process's lifetime.
 */
export function findProjectRoot(): string {
  if (cachedProjectRoot !== undefined) {
    return cachedProjectRoot;
  }
  let projectRoot = process.cwd();
  for (let d = projectRoot; d !== dirname(d); d = dirname(d)) {
    if (existsSync(join(d, "tsconfig.json"))) {
      projectRoot = d;
      break;
    }
  }
  cachedProjectRoot = projectRoot;
  return projectRoot;
}

/** @internal Exposed for testing only */
export function _resetProjectRootCache() {
  cachedProjectRoot = undefined;
}
