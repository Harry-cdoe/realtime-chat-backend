import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { redis } from "../../../../../packages/redis/src/client";
import { sendMessageToQueue } from "../../../../../packages/rabbitmq/src/producer";

let io: Server;

interface JwtPayload {
  userId: string;
  email: string;
}

export const initSocket = async (server: any) => {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  // Redis adapter setup
  const subClient = redis.duplicate();
  await subClient.connect();

  io.adapter(createAdapter(redis, subClient));

  console.log("✅ Redis Adapter attached successfully");

  /**
   * 🔐 Socket Authentication Middleware
   */
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET!,
      ) as JwtPayload;

      socket.data.userId = decoded.userId;

      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  /**
   * 🚀 Socket Connection
   */
  io.on("connection", async (socket) => {
    const userId = socket.data.userId;

    console.log(`👤 User connected: ${socket.id} (UID: ${userId})`);

    // store online user in Redis
    await redis.set(`online:${userId}`, socket.id);

    /**
     * Join Chat Room
     */
    socket.on("join_chat", (chatId: string) => {
      socket.join(chatId);
      console.log(`📥 User ${userId} joined room ${chatId}`);
    });

    /**
     * Send Message → RabbitMQ
     */
    socket.on("send_message", async (data) => {
      try {
        await sendMessageToQueue({
          chatId: data.chatId,
          senderId: userId,
          message: data.message,
          createdAt: new Date(),
        });

        console.log("📤 Message pushed to RabbitMQ");
      } catch (error) {
        console.error("❌ Failed to push message", error);
      }
    });

    /**
     * Typing Indicators
     */
    socket.on("typing_start", (chatId: string) => {
      socket.to(chatId).emit("typing_start", { userId });
    });

    socket.on("typing_stop", (chatId: string) => {
      socket.to(chatId).emit("typing_stop", { userId });
    });

    /**
     * Disconnect
     */
    socket.on("disconnect", async () => {
      console.log(`❌ User disconnected: ${socket.id}`);

      await redis.del(`online:${userId}`);
    });
  });

  return io;
};

/**
 * Get Socket Instance
 */
export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
