import * as dotenv from 'dotenv';
import * as path from 'path';

// Load the .env file located in the parent directory of 'src' (i.e., the 'postgres' folder)
dotenv.config({ path: path.resolve(__dirname, '../.env') }); 

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg'; // Import the adapter
import { Pool } from 'pg'; // Import the node-postgres driver

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// 1. Create the connection pool using your existing DATABASE_URL
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const pool = new Pool({ connectionString });

// 2. Instantiate the adapter
const adapter = new PrismaPg(pool);

// 3. Pass the adapter to the PrismaClient constructor
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter, // Add this line
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
