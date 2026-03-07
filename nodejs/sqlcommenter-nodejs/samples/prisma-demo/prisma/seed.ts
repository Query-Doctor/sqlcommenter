import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.label.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const [alice, bob, charlie] = await Promise.all([
    prisma.user.create({ data: { name: "Alice Chen", email: "alice@example.com" } }),
    prisma.user.create({ data: { name: "Bob Martinez", email: "bob@example.com" } }),
    prisma.user.create({ data: { name: "Charlie Kim", email: "charlie@example.com" } }),
  ]);

  // Labels
  const [bug, feature, docs, perf] = await Promise.all([
    prisma.label.create({ data: { name: "bug", color: "#e11d48" } }),
    prisma.label.create({ data: { name: "feature", color: "#3b82f6" } }),
    prisma.label.create({ data: { name: "docs", color: "#22c55e" } }),
    prisma.label.create({ data: { name: "performance", color: "#f97316" } }),
  ]);

  // Projects
  const [api, web] = await Promise.all([
    prisma.project.create({ data: { name: "API Server", key: "API", description: "Backend REST API service" } }),
    prisma.project.create({ data: { name: "Web Frontend", key: "WEB", description: "React web application" } }),
  ]);

  // Issues for API project
  const issues = await Promise.all([
    prisma.issue.create({
      data: {
        number: 1, title: "Auth endpoint returns 500 on expired tokens",
        description: "When a JWT token expires, the /auth/refresh endpoint throws an unhandled exception instead of returning 401.",
        status: "OPEN", priority: "HIGH", projectId: api.id, creatorId: alice.id, assigneeId: bob.id,
        labels: { connect: [{ id: bug.id }] },
      },
    }),
    prisma.issue.create({
      data: {
        number: 2, title: "Add rate limiting to public endpoints",
        description: "We need rate limiting on all public-facing endpoints to prevent abuse.",
        status: "IN_PROGRESS", priority: "MEDIUM", projectId: api.id, creatorId: bob.id, assigneeId: alice.id,
        labels: { connect: [{ id: feature.id }] },
      },
    }),
    prisma.issue.create({
      data: {
        number: 3, title: "Optimize N+1 query in /users/list",
        description: "The users list endpoint makes a separate query for each user's role. Should use a join.",
        status: "OPEN", priority: "HIGH", projectId: api.id, creatorId: charlie.id, assigneeId: bob.id,
        labels: { connect: [{ id: perf.id }, { id: bug.id }] },
      },
    }),
    prisma.issue.create({
      data: {
        number: 4, title: "Document webhook payload format",
        description: "External integrators need documentation for our webhook event payloads.",
        status: "CLOSED", priority: "LOW", projectId: api.id, creatorId: alice.id,
        labels: { connect: [{ id: docs.id }] },
      },
    }),
    // Web project issues
    prisma.issue.create({
      data: {
        number: 1, title: "Dashboard charts not rendering on Safari",
        description: "The D3 charts on the dashboard fail to render in Safari 17. Console shows a TypeError.",
        status: "OPEN", priority: "CRITICAL", projectId: web.id, creatorId: bob.id, assigneeId: charlie.id,
        labels: { connect: [{ id: bug.id }] },
      },
    }),
    prisma.issue.create({
      data: {
        number: 2, title: "Add dark mode support",
        description: "Users have requested dark mode. Should respect system preference and allow manual toggle.",
        status: "IN_REVIEW", priority: "MEDIUM", projectId: web.id, creatorId: alice.id, assigneeId: charlie.id,
        labels: { connect: [{ id: feature.id }] },
      },
    }),
    prisma.issue.create({
      data: {
        number: 3, title: "Reduce bundle size by lazy loading routes",
        description: "Initial load is 2.4MB. We can cut this in half with route-based code splitting.",
        status: "OPEN", priority: "MEDIUM", projectId: web.id, creatorId: charlie.id,
        labels: { connect: [{ id: perf.id }] },
      },
    }),
  ]);

  // Comments
  await Promise.all([
    prisma.comment.create({
      data: { body: "I can reproduce this with any expired token. The error is in the middleware layer.", issueId: issues[0].id, authorId: bob.id },
    }),
    prisma.comment.create({
      data: { body: "I think we should use express-rate-limit. It has built-in Redis support for distributed setups.", issueId: issues[1].id, authorId: alice.id },
    }),
    prisma.comment.create({
      data: { body: "Agreed. Let's set 100 req/min for authenticated and 20 req/min for anonymous.", issueId: issues[1].id, authorId: bob.id },
    }),
    prisma.comment.create({
      data: { body: "This is a known Safari bug with SVG viewBox. We need to add explicit width/height.", issueId: issues[4].id, authorId: charlie.id },
    }),
    prisma.comment.create({
      data: { body: "Dark mode PR is ready for review: PR #247", issueId: issues[5].id, authorId: charlie.id },
    }),
  ]);

  console.log("Seed complete: 3 users, 4 labels, 2 projects, 7 issues, 5 comments");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
