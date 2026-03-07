import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

interface DashboardData {
  totalProjects: number;
  totalIssues: number;
  openIssues: number;
  inProgressIssues: number;
  closedIssues: number;
  issuesByPriority: { priority: string; _count: { id: number } }[];
  recentIssues: {
    id: string;
    title: string;
    number: number;
    status: string;
    priority: string;
    project: { key: string };
    assignee: { name: string } | null;
    createdAt: string;
  }[];
  recentComments: {
    id: string;
    body: string;
    author: { name: string };
    issue: { title: string; number: number; project: { key: string } };
    createdAt: string;
  }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.getDashboard().then(setData);
  }, []);

  if (!data) return <div className="empty">Loading...</div>;

  return (
    <div>
      <h2 className="mb-16">Dashboard</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Projects</div>
          <div className="value">{data.totalProjects}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Issues</div>
          <div className="value">{data.totalIssues}</div>
        </div>
        <div className="stat-card">
          <div className="label">Open</div>
          <div className="value" style={{ color: "#3fb950" }}>{data.openIssues}</div>
        </div>
        <div className="stat-card">
          <div className="label">In Progress</div>
          <div className="value" style={{ color: "#d29922" }}>{data.inProgressIssues}</div>
        </div>
        <div className="stat-card">
          <div className="label">Closed</div>
          <div className="value" style={{ color: "#8b949e" }}>{data.closedIssues}</div>
        </div>
        {data.issuesByPriority.map((p) => (
          <div className="stat-card" key={p.priority}>
            <div className="label">{p.priority}</div>
            <div className="value">{p._count.id}</div>
          </div>
        ))}
      </div>

      <div className="section-header mt-16">
        <h2>Recent Issues</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.recentIssues.map((issue) => (
            <tr key={issue.id}>
              <td>
                <Link to={`/issues/${issue.id}`}>
                  {issue.project.key}-{issue.number} {issue.title}
                </Link>
              </td>
              <td><span className={`badge badge-${issue.status.toLowerCase().replace("_", "-")}`}>{issue.status.replace("_", " ")}</span></td>
              <td><span className={`badge badge-${issue.priority.toLowerCase()}`}>{issue.priority}</span></td>
              <td>{issue.assignee?.name ?? "Unassigned"}</td>
              <td className="text-muted">{new Date(issue.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-header mt-16">
        <h2>Recent Comments</h2>
      </div>
      {data.recentComments.map((c) => (
        <div key={c.id} className="comment-card">
          <div className="comment-meta">
            <strong>{c.author.name}</strong> on{" "}
            <Link to={`/issues/${c.id}`}>
              {c.issue.project.key}-{c.issue.number} {c.issue.title}
            </Link>
            {" "}&middot;{" "}{new Date(c.createdAt).toLocaleDateString()}
          </div>
          <div>{c.body.length > 120 ? c.body.slice(0, 120) + "..." : c.body}</div>
        </div>
      ))}
    </div>
  );
}
