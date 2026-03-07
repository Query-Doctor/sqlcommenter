import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  const [
    totalProjects,
    totalIssues,
    openIssues,
    inProgressIssues,
    closedIssues,
    issuesByPriority,
    recentIssues,
    recentComments,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.issue.count(),
    prisma.issue.count({ where: { status: "OPEN" } }),
    prisma.issue.count({ where: { status: "IN_PROGRESS" } }),
    prisma.issue.count({ where: { status: "CLOSED" } }),
    prisma.issue.groupBy({
      by: ["priority"],
      _count: { id: true },
    }),
    prisma.issue.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { key: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.comment.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { name: true } },
        issue: {
          select: {
            title: true,
            number: true,
            project: { select: { key: true } },
          },
        },
      },
    }),
  ]);

  res.json({
    totalProjects,
    totalIssues,
    openIssues,
    inProgressIssues,
    closedIssues,
    issuesByPriority,
    recentIssues,
    recentComments,
  });
});

export default router;
