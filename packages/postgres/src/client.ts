import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

import { PrismaClient } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

//
// ✅ Validate environment variable
//
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

//
// ✅ Global singleton type safety
//
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

//
// ✅ Create connection pool (singleton)
//
export const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: DATABASE_URL,

    max: 20, // max connections

    idleTimeoutMillis: 30000, // close idle connections

    connectionTimeoutMillis: 2000, // fail fast

    allowExitOnIdle: false,
  });

//
// ✅ Store pool globally (dev safety)
//
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pool = pool;
}

//
// ✅ Pool error handler (CRITICAL)
//
pool.on("error", (error) => {
  console.error("Unexpected Postgres pool error:", error);
});

pool.on("connect", () => {
  console.log("Postgres pool connected");
});

pool.on("remove", () => {
  console.log("Postgres connection removed from pool");
});

//
// ✅ Prisma adapter
//
const adapter = new PrismaPg(pool);

//
// ✅ Create Prisma client singleton
//
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,

    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

//
// ✅ Store globally
//
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

//
// ✅ Connection health check
//
export async function checkPostgresHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return true;
  } catch (error) {
    console.error("Postgres health check failed:", error);

    return false;
  }
}

//
// ✅ Graceful shutdown handler
//
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`Postgres shutdown signal received: ${signal}`);

  try {
    await prisma.$disconnect();

    await pool.end();

    console.log("Postgres connections closed");

    process.exit(0);
  } catch (error) {
    console.error("Error during Postgres shutdown:", error);

    process.exit(1);
  }
}

//
// ✅ Production shutdown signals
//
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