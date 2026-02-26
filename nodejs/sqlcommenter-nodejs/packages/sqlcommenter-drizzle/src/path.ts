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

/**
 * Resolves a file path from a stack trace to a correct absolute path.
 *
 * When compiled JS is relocated (e.g., postbuild copies `dist/` to a deployment directory),
 * source-map-resolved paths become incorrect because the relative `sources` entries in
 * `.map` files resolve against the new location instead of the original project.
 *
 * This extracts the `src/`-relative portion and reconstructs the path using the real
 * project root.
 *
 * @param raw - A stack trace entry like "/wrong/path/src/routes/admin.ts:12:15"
 * @returns The resolved path like "/project/root/src/routes/admin.ts:12:15"
 */
export function resolveFilePath(raw: string): string {
  // Split off :line:column suffix
  const match = raw.match(/^(.*?):(\d+:\d+)$/);
  if (!match) {
    return raw;
  }
  const [, filePath, lineCol] = match;
  const srcIdx = filePath.indexOf("src/");
  if (srcIdx < 0) {
    return raw;
  }
  const projectRoot = findProjectRoot();
  const relativePath = filePath.substring(srcIdx);
  const resolved = `${projectRoot}/${relativePath}`;
  return `${applyWslPrefix(resolved)}:${lineCol}`;
}

/**
 * Prefixes an absolute path with the WSL network path when running inside WSL.
 *
 * Inside WSL, absolute paths like `/home/user/project/...` can't be resolved
 * from Windows-side tooling (e.g., clickable links in dashboards or VS Code).
 * The `WSL_DISTRO_NAME` env var is always set inside WSL, and the path format
 * `//wsl.localhost/<distro>/...` makes paths accessible from Windows.
 */
export function applyWslPrefix(filePath: string): string {
  const distro = process.env.WSL_DISTRO_NAME;
  if (distro) {
    return `//wsl.localhost/${distro}${filePath}`;
  }
  return filePath;
}

/** @internal Exposed for testing only */
export function _resetProjectRootCache() {
  cachedProjectRoot = undefined;
}
