import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import { prisma } from "../../../packages/postgres/src/client";
import {
  connectMongo,
  disconnectMongo,
} from "../../../packages/mongo/src/client";
import { initSocket } from "././modules/lib/socket";
import { connectRedis, redis } from "../../../packages/redis/src/client";
import {
  connectRabbitMQ,
  closeRabbitMQ,
} from "../../../packages/rabbitmq/src/connection";
import { startConsumer } from "../../../packages/rabbitmq/src/consumer";
import { apiPort, frontendOrigins, socketPort } from "./modules/lib/config";

const app = express();

app.use(
  cors({
    origin: frontendOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(express.json());

import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/user/user.routes";
import chatRoutes from "./modules/chat/chat.routes";

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);

app.use("/", (_req, res) => {
  res.json({
    message: "Chat Backend API Running",
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Global error:", err);
  res.status(500).json({
    message: "Internal Server Error",
  });
});

let server: any;
let socketServer: any;

async function startServer() {
  try {
    await connectRedis();
    console.log("Connecting databases...");

    await connectMongo();
    await prisma.$connect();

    server = app.listen(apiPort, () => {
      console.log(`API server running on port ${apiPort}`);
    });

    socketServer = createServer();
    await initSocket(socketServer);
    socketServer.listen(socketPort, () => {
      console.log(`Socket server running on port ${socketPort}`);
    });

    const rabbitConnected = await connectRabbitMQ();
    if (rabbitConnected) {
      try {
        await startConsumer();
      } catch (error) {
        console.warn("Could not start RabbitMQ consumer:", error);
      }
    } else {
      console.warn("RabbitMQ is not available, continuing without queue consumer.");
    }

    console.log("Databases connected");
  } catch (error) {
    console.error("Startup error:", error);
    process.exit(1);
  }
}

startServer();

async function shutdown(signal: string) {
  console.log(`Received ${signal}`);

  try {
    server?.close(() => {
      console.log("HTTP server closed");
    });
    socketServer?.close(() => {
      console.log("Socket server closed");
    });

    await prisma.$disconnect();
    await disconnectMongo();

    if (redis.isOpen) {
      await redis.quit();
      console.log("Redis connection closed");
    }

    await closeRabbitMQ();

    console.log("All connections closed");

    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);
    process.exit(1);
  }
}

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
