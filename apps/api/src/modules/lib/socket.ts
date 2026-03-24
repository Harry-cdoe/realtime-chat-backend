import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "../../../../../packages/redis/src/client";
import { frontendOrigins } from "./config";
import { verifyAccessToken } from "./jwt";

let io: Server;

interface JwtPayload {
  userId: string;
  sessionId: string;
}

export const initSocket = async (server: any) => {
  io = new Server(server, {
    cors: {
      origin: frontendOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Redis adapter setup
  const subClient = redis.duplicate();
  await subClient.connect();

  io.adapter(createAdapter(redis, subClient));

  console.log("Redis Adapter attached successfully");

  /**
   * Socket Authentication Middleware
   */
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = verifyAccessToken(token) as JwtPayload;

      socket.data.userId = decoded.userId;

      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  /**
   * Socket Connection
   */
  io.on("connection", async (socket) => {
    const userId = socket.data.userId;

    console.log(`User connected: ${socket.id} (UID: ${userId})`);
    socket.join(userId);

    // store online user in Redis
    await redis.set(`online:${userId}`, socket.id);

    /**
     * Join Chat Room
     */
    socket.on("join_chat", (payload: unknown) => {
      const chatId =
        typeof payload === "string"
          ? payload.trim()
          : typeof (payload as { chatId?: unknown })?.chatId === "string"
            ? ((payload as { chatId: string }).chatId || "").trim()
            : "";

      if (!chatId) {
        console.error("Invalid join_chat payload", { userId, payload });
        return;
      }

      if (socket.rooms.has(chatId)) {
        return;
      }

      socket.join(chatId);
      console.log(`User ${userId} joined room ${chatId}`);
    });

    /**
     * Send Message is API-only. Socket is receive-only for messages.
     */
    socket.on("send_message", () => {
      socket.emit("message_error", {
        code: "API_ONLY_SEND",
        message: "Use REST API /api/chats/message to send messages",
      });
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
      console.log(`User disconnected: ${socket.id}`);

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
