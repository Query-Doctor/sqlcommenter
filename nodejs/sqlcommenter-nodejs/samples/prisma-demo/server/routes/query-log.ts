import { Router } from "express";
import { getQueryLogs, clearQueryLogs } from "../query-log.js";

const router = Router();

router.get("/", (req, res) => {
  const sinceId = Number(req.query.sinceId) || 0;
  res.json(getQueryLogs(sinceId));
});

router.delete("/", (_req, res) => {
  clearQueryLogs();
  res.status(204).end();
});

export default router;
