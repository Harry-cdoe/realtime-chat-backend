import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { disconnectMongo, connectMongo } from "../../../packages/mongo/src/client";
import { closeRabbitMQ, connectRabbitMQ } from "../../../packages/rabbitmq/src/connection";
import { startMessagePersistenceConsumer } from "../../../packages/rabbitmq/src/consumer";

const loadWorkerEnv = () => {
  const candidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/api/.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../api/.env"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const result = dotenv.config({ path: envPath, override: false });
    if (!result.error) {
      console.log(`[worker] Loaded env from: ${envPath}`);
      return;
    }
  }

  console.warn(
    "[worker] No .env file found in known paths. Relying on process environment variables.",
  );
};

loadWorkerEnv();

async function startWorker() {
  try {
    console.log("[worker] Starting worker process...");
    await connectMongo();
    console.log("[worker] MongoDB connected");

    const rabbitConnected = await connectRabbitMQ();
    if (!rabbitConnected) {
      throw new Error("RabbitMQ unavailable for worker");
    }
    console.log("[worker] RabbitMQ connected");

    await startMessagePersistenceConsumer();

    console.log("[worker] Worker started: persistence consumer is running");
  } catch (error) {
    console.error("Worker startup error:", error);
    process.exit(1);
  }
}

startWorker();

async function shutdown(signal: string) {
  console.log(`Worker received ${signal}`);

  try {
    await disconnectMongo();
    await closeRabbitMQ();

    console.log("Worker shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("Worker shutdown error:", error);
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error("[worker] Uncaught Exception:", error);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled Rejection:", reason);
  shutdown("unhandledRejection");
});
