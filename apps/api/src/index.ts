import express from "express";
import { prisma } from "@packages/postgres";

const app = express();

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
