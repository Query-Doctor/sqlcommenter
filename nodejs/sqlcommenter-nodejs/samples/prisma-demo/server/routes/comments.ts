import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.post("/", async (req, res) => {
  const { body, issueId, authorId } = req.body;
  const comment = await prisma.comment.create({
    data: { body, issueId, authorId },
    include: { author: { select: { id: true, name: true } } },
  });
  res.status(201).json(comment);
});

router.put("/:id", async (req, res) => {
  const { body } = req.body;
  const comment = await prisma.comment.update({
    where: { id: req.params.id },
    data: { body },
    include: { author: { select: { id: true, name: true } } },
  });
  res.json(comment);
});

router.delete("/:id", async (req, res) => {
  await prisma.comment.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
