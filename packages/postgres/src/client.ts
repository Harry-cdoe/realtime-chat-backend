import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prevent multiple instances in dev (Hot reload safety)
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Ensure DATABASE_URL exists
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

//
// ✅ Improvement 1: Proper Pool Configuration
//
const pool = new Pool({
  connectionString,

  // ✅ Maximum number of connections in pool
  max: 20,

  // ✅ Close idle connections after 30 seconds
  idleTimeoutMillis: 30000,

  // ✅ Timeout if connection not acquired in 2 seconds
  connectionTimeoutMillis: 2000,
});

//
// ✅ Improvement 2: Prisma Adapter using pool
//
const adapter = new PrismaPg(pool);

//
// ✅ Improvement 3: Singleton Prisma Client
//
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

//
// ✅ Improvement 4: Graceful shutdown (VERY IMPORTANT)
//
async function shutdown() {
  console.log('Closing database connections...');

  await prisma.$disconnect();

  await pool.end();

  process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', shutdown);

// Handle Docker / Kubernetes shutdown
process.on('SIGTERM', shutdown);

// Handle Node crashes
process.on('beforeExit', shutdown);