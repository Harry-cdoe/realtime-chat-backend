import "dotenv/config";
import express from "express";
import { prisma } from "../../../packages/postgres/src/client";
import { connectMongo } from "../../../packages/mongo/src/client";

import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/user/user.routes";
import chatRoutes from "./modules/chat/chat.routes";

const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);

// health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);

  res.status(500).json({
    message: "Internal Server Error",
  });
});

async function startServer() {
  try {

    // connect databases
    await connectMongo();

    // test postgres connection
    await prisma.$connect();

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`API running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Startup error:", error);
    process.exit(1);
  }
}

startServer();

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});