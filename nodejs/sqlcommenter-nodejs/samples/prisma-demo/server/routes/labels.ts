import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  const labels = await prisma.label.findMany({
    include: { _count: { select: { issues: true } } },
    orderBy: { name: "asc" },
  });
  res.json(labels);
});

router.post("/", async (req, res) => {
  const { name, color } = req.body;
  const label = await prisma.label.create({ data: { name, color } });
  res.status(201).json(label);
});

router.delete("/:id", async (req, res) => {
  await prisma.label.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
