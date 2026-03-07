import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { assignedIssues: true, createdIssues: true, comments: true },
      },
    },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

export default router;
