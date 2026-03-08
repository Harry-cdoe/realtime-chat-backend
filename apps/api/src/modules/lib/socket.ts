import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "../../../../../packages/redis/src/client";

let io: Server;

export const initSocket = async (server: any) => {
  io = new Server(server, {
    cors: {
      origin: "*", // In production, replace with your frontend URL
    },
  });

  // 1. Create and connect the subscriber client (Duplicate of main redis client)
  const subClient = redis.duplicate();
  await subClient.connect();

  // 2. Attach the Redis Adapter
  io.adapter(createAdapter(redis, subClient));
  console.log("✅ Redis Adapter attached successfully");

  io.on("connection", async (socket) => {
    // Note: Ensure your frontend passes userId in 'auth' or use a middleware
    const userId = socket.handshake.auth.userId;

    console.log(
      `👤 User connected: ${socket.id} (UID: ${userId || "Anonymous"})`,
    );

    // Store online status
    if (userId) {
      await redis.set(`online:${userId}`, socket.id);
    }

    // --- Event Handlers ---

    socket.on("join_chat", (chatId: string) => {
      socket.join(chatId);
      console.log(`Join Room: ${chatId}`);
    });

    socket.on("typing_start", (chatId: string) => {
      socket.to(chatId).emit("typing_start", { userId });
    });

    socket.on("typing_stop", (chatId: string) => {
      socket.to(chatId).emit("typing_stop", { userId });
    });

    socket.on("disconnect", async () => {
      console.log(`❌ User disconnected: ${socket.id}`);
      if (userId) {
        await redis.del(`online:${userId}`);
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized. Call initSocket first.");
  return io;
};
