const BASE = "/api";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  // Dashboard
  getDashboard: () => request("/dashboard"),

  // Projects
  getProjects: () => request("/projects"),
  getProject: (id: string) => request(`/projects/${id}`),
  createProject: (data: { name: string; key: string; description?: string }) =>
    request("/projects", { method: "POST", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request(`/projects/${id}`, { method: "DELETE" }),

  // Issues
  getIssues: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request(`/issues${qs}`);
  },
  getIssue: (id: string) => request(`/issues/${id}`),
  createIssue: (data: Record<string, unknown>) =>
    request("/issues", { method: "POST", body: JSON.stringify(data) }),
  updateIssue: (id: string, data: Record<string, unknown>) =>
    request(`/issues/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteIssue: (id: string) =>
    request(`/issues/${id}`, { method: "DELETE" }),
  bulkUpdateIssues: (issueIds: string[], status: string) =>
    request("/issues/bulk-update", {
      method: "POST",
      body: JSON.stringify({ issueIds, status }),
    }),

  // Comments
  createComment: (data: { body: string; issueId: string; authorId: string }) =>
    request("/comments", { method: "POST", body: JSON.stringify(data) }),
  deleteComment: (id: string) =>
    request(`/comments/${id}`, { method: "DELETE" }),

  // Labels
  getLabels: () => request("/labels"),
  createLabel: (data: { name: string; color: string }) =>
    request("/labels", { method: "POST", body: JSON.stringify(data) }),
  deleteLabel: (id: string) =>
    request(`/labels/${id}`, { method: "DELETE" }),

  // Users
  getUsers: () => request("/users"),

  // Query log
  getQueryLogs: (sinceId?: number) =>
    request(`/query-log${sinceId ? `?sinceId=${sinceId}` : ""}`),
  clearQueryLogs: () => request("/query-log", { method: "DELETE" }),
};
