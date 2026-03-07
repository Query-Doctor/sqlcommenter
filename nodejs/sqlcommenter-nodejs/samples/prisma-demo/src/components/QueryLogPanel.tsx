import { useState, useEffect, useRef } from "react";
import { api } from "../api";

interface LogEntry {
  id: number;
  sql: string;
  timestamp: number;
  durationMs: number;
}

function highlightComment(sql: string) {
  const commentStart = sql.lastIndexOf("/*");
  if (commentStart === -1) return <>{sql}</>;
  return (
    <>
      {sql.slice(0, commentStart)}
      <span className="comment">{sql.slice(commentStart)}</span>
    </>
  );
}

export default function QueryLogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const lastId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const newEntries = await api.getQueryLogs(lastId.current);
        if (newEntries.length > 0) {
          lastId.current = newEntries[newEntries.length - 1].id;
          setEntries((prev) => [...prev, ...newEntries].slice(-200));
        }
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (autoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries]);

  function handleScroll() {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScroll.current = scrollHeight - scrollTop - clientHeight < 40;
  }

  return (
    <div className="query-log">
      <div className="query-log-header">
        <h3>SQL Query Log (sqlcommenter annotations in blue)</h3>
        <button
          className="btn btn-sm"
          onClick={() => {
            setEntries([]);
            lastId.current = 0;
            api.clearQueryLogs();
          }}
        >
          Clear
        </button>
      </div>
      <div
        className="query-log-entries"
        ref={listRef}
        onScroll={handleScroll}
      >
        {entries.map((e) => (
          <div key={e.id} className="query-entry">
            <span className="query-time">
              {new Date(e.timestamp).toLocaleTimeString()}
            </span>
            <span className="query-duration">
              {e.durationMs.toFixed(1)}ms
            </span>
            <span className="query-sql">{highlightComment(e.sql)}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="empty">Queries will appear here as you interact with the app</div>
        )}
      </div>
    </div>
  );
}
