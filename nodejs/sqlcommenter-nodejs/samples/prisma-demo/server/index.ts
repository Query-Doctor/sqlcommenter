import express from "express";
import cors from "cors";
import { withQueryTags } from "./db.js";
import projectRoutes from "./routes/projects.js";
import issueRoutes from "./routes/issues.js";
import commentRoutes from "./routes/comments.js";
import labelRoutes from "./routes/labels.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import queryLogRoutes from "./routes/query-log.js";

const app = express();
app.use(cors());
app.use(express.json());

// Inject request context as sqlcommenter query tags
app.use((req, res, next) => {
  withQueryTags(
    { route: req.path, method: req.method },
    async () => {
      return new Promise<void>((resolve) => {
        res.on("finish", resolve);
        next();
      });
    },
  );
});

app.use("/api/projects", projectRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/labels", labelRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/query-log", queryLogRoutes);

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
