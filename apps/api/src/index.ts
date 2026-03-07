import "dotenv/config";
import express from "express";
import { prisma } from "../../../packages/postgres/src/client";
import {
  connectMongo,
  disconnectMongo,
} from "../../../packages/mongo/src/client";
import { initSocket } from "././modules/lib/socket";

const app = express();

app.use(express.json());

import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/user/user.routes";
import chatRoutes from "./modules/chat/chat.routes";

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);

// health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Global error:", err);
  res.status(500).json({
    message: "Internal Server Error",
  });
});

let server: any;

async function startServer() {
  try {
    console.log("Connecting databases...");

    await connectMongo();
    await prisma.$connect();

    console.log("Databases connected");

    const PORT = process.env.PORT || 3000;

    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    initSocket(server);
  } catch (error) {
    console.error("Startup error:", error);
    process.exit(1);
  }
}

startServer();

// graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`Received ${signal}`);
  try {
    server?.close(() => {
      console.log("HTTP server closed");
    });

    await prisma.$disconnect();
    await disconnectMongo();

    console.log("All connections closed");
    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);
    process.exit(1);
  }
}

// important signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  shutdown("unhandledRejection");
});
