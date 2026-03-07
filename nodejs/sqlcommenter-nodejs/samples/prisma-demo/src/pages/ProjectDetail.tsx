import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";

interface Issue {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  assignee: { id: string; name: string } | null;
  labels: { id: string; name: string; color: string }[];
  _count: { comments: number };
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ status: "", priority: "", search: "", page: "1" });
  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: "", description: "", priority: "MEDIUM", assigneeId: "", labelIds: [] as string[], creatorId: "",
  });

  const loadIssues = useCallback(() => {
    const params: Record<string, string> = { projectId: id! };
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.search) params.search = filters.search;
    params.page = filters.page;
    api.getIssues(params).then((res) => {
      setIssues(res.issues);
      setTotal(res.total);
    });
  }, [id, filters]);

  useEffect(() => { api.getProject(id!).then(setProject); }, [id]);
  useEffect(() => { loadIssues(); }, [loadIssues]);
  useEffect(() => {
    api.getUsers().then(setUsers);
    api.getLabels().then(setLabels);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createIssue({ ...form, projectId: id, creatorId: form.creatorId || users[0]?.id });
    setForm({ title: "", description: "", priority: "MEDIUM", assigneeId: "", labelIds: [], creatorId: "" });
    setShowCreate(false);
    loadIssues();
  }

  async function handleBulkUpdate(status: string) {
    if (selected.size === 0) return;
    await api.bulkUpdateIssues([...selected], status);
    setSelected(new Set());
    loadIssues();
  }

  if (!project) return <div className="empty">Loading...</div>;

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="section-header">
        <div>
          <Link to="/projects" className="text-muted">&larr; Projects</Link>
          <h2>{project.key} &middot; {project.name}</h2>
          {project.description && <p className="text-muted">{project.description}</p>}
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>New Issue</button>
      </div>

      {/* Filters */}
      <div className="form-row mb-16">
        <input
          placeholder="Search issues..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: "1" })}
        />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: "1" })}>
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value, page: "1" })}>
          <option value="">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex-center mb-16">
          <span className="text-muted">{selected.size} selected</span>
          <button className="btn btn-sm" onClick={() => handleBulkUpdate("IN_PROGRESS")}>Mark In Progress</button>
          <button className="btn btn-sm" onClick={() => handleBulkUpdate("CLOSED")}>Close</button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>
              <input
                type="checkbox"
                checked={selected.size === issues.length && issues.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(issues.map((i) => i.id)) : new Set())}
              />
            </th>
            <th>#</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Labels</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(issue.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    e.target.checked ? next.add(issue.id) : next.delete(issue.id);
                    setSelected(next);
                  }}
                />
              </td>
              <td>{project.key}-{issue.number}</td>
              <td><Link to={`/issues/${issue.id}`}>{issue.title}</Link></td>
              <td><span className={`badge badge-${issue.status.toLowerCase().replace("_", "-")}`}>{issue.status.replace(/_/g, " ")}</span></td>
              <td><span className={`badge badge-${issue.priority.toLowerCase()}`}>{issue.priority}</span></td>
              <td>{issue.assignee?.name ?? <span className="text-muted">Unassigned</span>}</td>
              <td>{issue.labels.map((l) => <span key={l.id} className="badge" style={{ background: l.color, marginRight: 4 }}>{l.name}</span>)}</td>
              <td>{issue._count.comments}</td>
            </tr>
          ))}
          {issues.length === 0 && <tr><td colSpan={8} className="empty">No issues found</td></tr>}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-center mt-16" style={{ justifyContent: "center", gap: 8 }}>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              className={`btn btn-sm${filters.page === String(i + 1) ? " btn-primary" : ""}`}
              onClick={() => setFilters({ ...filters, page: String(i + 1) })}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="text-muted mt-8">{total} issue{total !== 1 ? "s" : ""} total</div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Issue</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Assignee</label>
                  <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Creator</label>
                <select value={form.creatorId} onChange={(e) => setForm({ ...form, creatorId: e.target.value })}>
                  <option value="">Select...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Labels</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {labels.map((l) => (
                    <label key={l.id} className="flex-center" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={form.labelIds.includes(l.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...form.labelIds, l.id]
                            : form.labelIds.filter((x) => x !== l.id);
                          setForm({ ...form, labelIds: ids });
                        }}
                      />
                      <span className="label-dot" style={{ background: l.color }} />{l.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
