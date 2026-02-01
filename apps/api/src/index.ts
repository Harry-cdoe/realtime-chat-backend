import "dotenv/config";
import express from "express";
import { prisma } from "../../../packages/postgres/src/client";
import { connectMongo } from "../../../packages/mongo/src/client";
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/user/user.routes";
import chatRoutes from "./modules/chat/chat.routes";

const app = express();

app.use(express.json());

connectMongo();

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);

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
