import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  _count: { issues: number };
  createdAt: string;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", key: "", description: "" });

  const load = () => api.getProjects().then(setProjects);
  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createProject(form);
    setForm({ name: "", key: "", description: "" });
    setShowCreate(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project and all its issues?")) return;
    await api.deleteProject(id);
    load();
  }

  return (
    <div>
      <div className="section-header">
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          New Project
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Name</th>
            <th>Issues</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td><Link to={`/projects/${p.id}`}>{p.key}</Link></td>
              <td><Link to={`/projects/${p.id}`}>{p.name}</Link></td>
              <td>{p._count.issues}</td>
              <td className="text-muted">{new Date(p.createdAt).toLocaleDateString()}</td>
              <td>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr><td colSpan={5} className="empty">No projects yet</td></tr>
          )}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Project</h2>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Key (e.g. PROJ)</label>
                  <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} required maxLength={6} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
