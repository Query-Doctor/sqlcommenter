import { Routes, Route, NavLink } from "react-router-dom";
import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import IssueDetail from "./pages/IssueDetail";
import Labels from "./pages/Labels";
import QueryLogPanel from "./components/QueryLogPanel";
import "./app.css";

export default function App() {
  const [queryLogOpen, setQueryLogOpen] = useState(true);

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>DevTracker</h1>
          <span className="subtitle">SQLCommenter Demo</span>
        </div>
        <ul>
          <li><NavLink to="/">Dashboard</NavLink></li>
          <li><NavLink to="/projects">Projects</NavLink></li>
          <li><NavLink to="/labels">Labels</NavLink></li>
        </ul>
        <div className="sidebar-footer">
          <button
            className="btn btn-sm"
            onClick={() => setQueryLogOpen((o) => !o)}
          >
            {queryLogOpen ? "Hide" : "Show"} Query Log
          </button>
        </div>
      </nav>
      <main className="content">
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/issues/:id" element={<IssueDetail />} />
            <Route path="/labels" element={<Labels />} />
          </Routes>
        </div>
        {queryLogOpen && <QueryLogPanel />}
      </main>
    </div>
  );
}
