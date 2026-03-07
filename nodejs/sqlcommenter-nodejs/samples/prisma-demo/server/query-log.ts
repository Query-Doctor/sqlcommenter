export interface QueryLogEntry {
  id: number;
  sql: string;
  timestamp: number;
  durationMs: number;
}

const MAX_ENTRIES = 200;
let nextId = 1;
const entries: QueryLogEntry[] = [];

export function addQueryLog(sql: string, durationMs: number) {
  entries.push({ id: nextId++, sql, timestamp: Date.now(), durationMs });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

export function getQueryLogs(sinceId = 0): QueryLogEntry[] {
  return entries.filter((e) => e.id > sinceId);
}

export function clearQueryLogs() {
  entries.length = 0;
}
