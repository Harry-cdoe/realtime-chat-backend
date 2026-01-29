import "dotenv/config";
import express from "express";
import { prisma } from "../../../packages/postgres/src/client";
import authRoutes from "./modules/auth/auth.routes";

const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.listen(3000, () => {
  console.log("API running on port 3000");
});
