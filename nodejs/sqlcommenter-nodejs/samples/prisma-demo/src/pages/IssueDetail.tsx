import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";

interface Issue {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  project: { key: string; name: string };
  projectId: string;
  assignee: { id: string; name: string } | null;
  creator: { id: string; name: string };
  labels: { id: string; name: string; color: string }[];
  comments: {
    id: string;
    body: string;
    author: { id: string; name: string };
    createdAt: string;
  }[];
  createdAt: string;
}

export default function IssueDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [commentBody, setCommentBody] = useState("");

  const load = () => api.getIssue(id!).then(setIssue);
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.getUsers().then(setUsers); }, []);

  async function updateField(data: Record<string, unknown>) {
    await api.updateIssue(id!, data);
    load();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    await api.createComment({ body: commentBody, issueId: id!, authorId: users[0]?.id });
    setCommentBody("");
    load();
  }

  async function deleteComment(commentId: string) {
    await api.deleteComment(commentId);
    load();
  }

  async function handleDelete() {
    if (!confirm("Delete this issue?")) return;
    await api.deleteIssue(id!);
    navigate(`/projects/${issue!.projectId}`);
  }

  if (!issue) return <div className="empty">Loading...</div>;

  return (
    <div>
      <Link to={`/projects/${issue.projectId}`} className="text-muted">&larr; {issue.project.key} &middot; {issue.project.name}</Link>

      <div className="issue-header mt-8">
        <h2>{issue.project.key}-{issue.number}: {issue.title}</h2>
        <div className="issue-meta">
          <span className={`badge badge-${issue.status.toLowerCase().replace("_", "-")}`}>
            {issue.status.replace(/_/g, " ")}
          </span>
          <span className={`badge badge-${issue.priority.toLowerCase()}`}>
            {issue.priority}
          </span>
          {issue.labels.map((l) => (
            <span key={l.id} className="badge" style={{ background: l.color }}>{l.name}</span>
          ))}
          <span className="text-muted">
            Created by {issue.creator.name} on {new Date(issue.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Editable fields */}
      <div className="form-row mb-16">
        <div className="form-group">
          <label>Status</label>
          <select value={issue.status} onChange={(e) => updateField({ status: e.target.value })}>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select value={issue.priority} onChange={(e) => updateField({ priority: e.target.value })}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        <div className="form-group">
          <label>Assignee</label>
          <select value={issue.assignee?.id ?? ""} onChange={(e) => updateField({ assigneeId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Description */}
      <h3 className="mb-16">Description</h3>
      <div className="issue-body">
        {issue.description || <span className="text-muted">No description provided.</span>}
      </div>

      {/* Comments */}
      <div className="section-header">
        <h3>Comments ({issue.comments.length})</h3>
      </div>

      {issue.comments.map((c) => (
        <div key={c.id} className="comment-card">
          <div className="comment-meta">
            <strong>{c.author.name}</strong> &middot; {new Date(c.createdAt).toLocaleString()}
            <button
              className="btn btn-sm btn-danger"
              style={{ float: "right" }}
              onClick={() => deleteComment(c.id)}
            >
              Delete
            </button>
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
        </div>
      ))}

      <form onSubmit={addComment} className="mt-16">
        <div className="form-group">
          <label>Add Comment</label>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            placeholder="Write a comment..."
          />
        </div>
        <div className="flex-center">
          <button type="submit" className="btn btn-primary">Post Comment</button>
          <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete Issue</button>
        </div>
      </form>
    </div>
  );
}
