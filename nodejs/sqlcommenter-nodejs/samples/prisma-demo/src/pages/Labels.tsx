import { useState, useEffect } from "react";
import { api } from "../api";

interface Label {
  id: string;
  name: string;
  color: string;
  _count: { issues: number };
}

const COLORS = ["#e11d48", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function Labels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", color: COLORS[0] });

  const load = () => api.getLabels().then(setLabels);
  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createLabel(form);
    setForm({ name: "", color: COLORS[0] });
    setShowCreate(false);
    load();
  }

  async function handleDelete(id: string) {
    await api.deleteLabel(id);
    load();
  }

  return (
    <div>
      <div className="section-header">
        <h2>Labels</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>New Label</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Issues</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {labels.map((l) => (
            <tr key={l.id}>
              <td>
                <span className="label-dot" style={{ background: l.color }} />
                {l.name}
              </td>
              <td>{l._count.issues}</td>
              <td>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(l.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {labels.length === 0 && <tr><td colSpan={3} className="empty">No labels yet</td></tr>}
        </tbody>
      </table>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Label</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Color</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {COLORS.map((c) => (
                    <div
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      style={{
                        width: 32, height: 32, borderRadius: 6, background: c, cursor: "pointer",
                        border: form.color === c ? "3px solid #fff" : "3px solid transparent",
                      }}
                    />
                  ))}
                </div>
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
