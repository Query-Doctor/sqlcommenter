import { Router } from "express";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// List issues with filtering, search, pagination
router.get("/", async (req, res) => {
  const {
    projectId,
    status,
    priority,
    assigneeId,
    labelId,
    search,
    page = "1",
    limit = "20",
  } = req.query;

  const where: Prisma.IssueWhereInput = {};
  if (projectId) where.projectId = projectId as string;
  if (status) where.status = status as Prisma.EnumIssueStatusFilter;
  if (priority) where.priority = priority as Prisma.EnumPriorityFilter;
  if (assigneeId) where.assigneeId = assigneeId as string;
  if (labelId)
    where.labels = { some: { id: labelId as string } };
  if (search)
    where.OR = [
      { title: { contains: search as string, mode: "insensitive" } },
      { description: { contains: search as string, mode: "insensitive" } },
    ];

  const skip = (Number(page) - 1) * Number(limit);

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        project: { select: { key: true, name: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        labels: true,
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.issue.count({ where }),
  ]);

  res.json({ issues, total, page: Number(page), limit: Number(limit) });
});

// Get single issue
router.get("/:id", async (req, res) => {
  const issue = await prisma.issue.findUnique({
    where: { id: req.params.id },
    include: {
      project: { select: { key: true, name: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      labels: true,
      comments: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!issue) return res.status(404).json({ error: "Not found" });
  res.json(issue);
});

// Create issue
router.post("/", async (req, res) => {
  const { title, description, projectId, priority, assigneeId, labelIds, creatorId } =
    req.body;

  // Get next issue number for this project (transaction)
  const issue = await prisma.$transaction(async (tx) => {
    const lastIssue = await tx.issue.findFirst({
      where: { projectId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (lastIssue?.number ?? 0) + 1;

    return tx.issue.create({
      data: {
        number,
        title,
        description,
        projectId,
        priority,
        creatorId,
        assigneeId: assigneeId || undefined,
        labels: labelIds?.length
          ? { connect: labelIds.map((id: string) => ({ id })) }
          : undefined,
      },
      include: {
        project: { select: { key: true, name: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        labels: true,
      },
    });
  });

  res.status(201).json(issue);
});

// Update issue
router.put("/:id", async (req, res) => {
  const { title, description, status, priority, assigneeId, labelIds } =
    req.body;

  const data: Prisma.IssueUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (assigneeId !== undefined)
    data.assignee = assigneeId
      ? { connect: { id: assigneeId } }
      : { disconnect: true };
  if (labelIds !== undefined)
    data.labels = { set: labelIds.map((id: string) => ({ id })) };

  const issue = await prisma.issue.update({
    where: { id: req.params.id },
    data,
    include: {
      project: { select: { key: true, name: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      labels: true,
    },
  });
  res.json(issue);
});

// Delete issue
router.delete("/:id", async (req, res) => {
  await prisma.issue.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// Bulk status update (transaction)
router.post("/bulk-update", async (req, res) => {
  const { issueIds, status } = req.body;
  const result = await prisma.$transaction(
    issueIds.map((id: string) =>
      prisma.issue.update({ where: { id }, data: { status } }),
    ),
  );
  res.json({ updated: result.length });
});

export default router;
