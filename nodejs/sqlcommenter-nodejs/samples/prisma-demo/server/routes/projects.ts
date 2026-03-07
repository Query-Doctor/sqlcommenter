import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { _count: { select: { issues: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(projects);
});

router.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { issues: true } } },
  });
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json(project);
});

router.post("/", async (req, res) => {
  const { name, key, description } = req.body;
  const project = await prisma.project.create({
    data: { name, key: key.toUpperCase(), description },
  });
  res.status(201).json(project);
});

router.put("/:id", async (req, res) => {
  const { name, description } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { name, description },
  });
  res.json(project);
});

router.delete("/:id", async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
