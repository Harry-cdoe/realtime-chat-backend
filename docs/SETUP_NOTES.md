# Monorepo + Prisma Setup Notes

This document captures key fixes and decisions made while setting up
a production-grade Node.js + TypeScript monorepo with Prisma.

What We Solved

Monorepo Pathing: Fixed rootDir and include so the API workspace can correctly resolve the Postgres package.

Prisma 7+ Driver Adapter: Integrated @prisma/adapter-pg with a pg connection pool to satisfy Prisma’s new driver adapter requirement for Node.js servers.

Type Safety: Resolved missing model properties by ensuring the Prisma generated output directory is included in tsconfig.json.

Environment Loading: Configured nodemon to explicitly load the .env file located inside the Postgres package.

Notes for Future Changes

After updating schema.prisma, always run npx prisma generate from packages/postgres.

If TypeScript errors persist, restart the TS Server in VS Code to clear cached types.