import { resolveFilePath } from "./path.js";

const LIBRARY_NAME = "sqlcommenter-prisma";

function isValidCaller(line: string): boolean {
  if (line.includes("node_modules")) {
    return false;
  }
  if (line.includes("node:internal") || line.includes("node:async_hooks")) {
    return false;
  }
  // make sure we don't break our own tests
  if (line.includes(`${LIBRARY_NAME}/test/`)) {
    return true;
  }
  if (line.includes(LIBRARY_NAME)) {
    return false;
  }
  return true;
}

// (file.ts:12:12) or file.ts:12:12
const filepathRegex = /([^ (]*?:\d+:\d+)\)?$/;

export function traceCaller(): string | undefined {
  const stack = new Error().stack;
  if (!stack) {
    return;
  }
  // skip 1 line for `Error:`, 1 line for the caller of the current function
  const stackLines = stack.split("\n").slice(2);
  const methodCaller = stackLines.find(isValidCaller);
  if (!methodCaller) {
    return;
  }
  const match = methodCaller.match(filepathRegex);
  if (match) {
    return resolveFilePath(match[1]);
  }
}
