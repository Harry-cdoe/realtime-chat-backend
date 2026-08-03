import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "../../../../../packages/redis/src/client";
import { ChatService } from "../chat/chat.service";
import { frontendOrigins } from "./config";
import { verifyAccessToken } from "./jwt";
import {
  assertUserIsParticipant,
  AuthorizationError,
  isAuthorizationError,
  isValidationError,
  ValidationError,
} from "../chat/chat.auth";

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
    socket.on("join_chat", async (payload: unknown) => {
      const chatId =
        typeof payload === "string"
          ? payload.trim()
          : typeof (payload as { chatId?: unknown })?.chatId === "string"
            ? ((payload as { chatId: string }).chatId || "").trim()
            : "";

      if (!chatId) {
        socket.emit("error", {
          code: "INVALID_PAYLOAD",
          message: "chatId is required to join chat",
        });
        return;
      }

      if (socket.rooms.has(chatId)) {
        return;
      }

      try {
        await assertUserIsParticipant(chatId, userId);
      } catch (error: unknown) {
        if (isAuthorizationError(error)) {
          socket.emit("error", {
            code: "FORBIDDEN",
            message: error.message,
          });
          return;
        }

        if (isValidationError(error)) {
          socket.emit("error", {
            code: "VALIDATION_ERROR",
            message: error.message,
          });
          return;
        }

        socket.emit("error", {
          code: "UNKNOWN_ERROR",
          message: "Unable to join chat",
        });
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
     * Message delivered acknowledgement from receiver.
     */
    socket.on("receive_message_ack", async (payload: unknown) => {
      try {
        const chatId =
          typeof (payload as { chatId?: unknown })?.chatId === "string"
            ? ((payload as { chatId: string }).chatId || "").trim()
            : "";
        const messageId =
          typeof (payload as { messageId?: unknown })?.messageId === "string"
            ? ((payload as { messageId: string }).messageId || "").trim()
            : "";

        if (!chatId || !messageId) {
          socket.emit("error", {
            code: "INVALID_PAYLOAD",
            message: "chatId and messageId are required",
          });
          return;
        }

        const updated = await ChatService.markMessageDelivered(
          chatId,
          messageId,
          userId,
          { skipAuth: socket.rooms.has(chatId) },
        );

        if (!updated) {
          return;
        }

        socket.to(chatId).emit("message_delivered", {
          messageId,
          chatId,
          userId,
          status: "delivered",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("receive_message_ack failed", error);
      }
    });

    /**
     * Mark chat messages as read.
     */
    socket.on("mark_read", async (payload: unknown) => {
      try {
        const chatId =
          typeof (payload as { chatId?: unknown })?.chatId === "string"
            ? ((payload as { chatId: string }).chatId || "").trim()
            : "";

        const incomingMessageIds = (payload as { messageIds?: unknown })
          ?.messageIds;
        const messageIds = Array.isArray(incomingMessageIds)
          ? incomingMessageIds
              .filter((id): id is string => typeof id === "string")
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
          : [];

        if (!chatId) {
          socket.emit("error", {
            code: "INVALID_PAYLOAD",
            message: "chatId is required",
          });
          return;
        }

        const updatedMessageIds = await ChatService.markMessagesRead(
          chatId,
          userId,
          messageIds,
          { skipAuth: socket.rooms.has(chatId) },
        );

        if (updatedMessageIds.length === 0) {
          return;
        }

        socket.to(chatId).emit("message_read", {
          messageIds: updatedMessageIds,
          chatId,
          userId,
          status: "read",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("mark_read failed", error);
      }
    });

    /**
     * Typing Indicators
     */
    socket.on("typing_start", async (chatId: string) => {
      const normalizedChatId = typeof chatId === "string" ? chatId.trim() : "";
      if (!normalizedChatId) {
        socket.emit("error", {
          code: "INVALID_PAYLOAD",
          message: "chatId is required",
        });
        return;
      }

      if (!socket.rooms.has(normalizedChatId)) {
        try {
          await assertUserIsParticipant(normalizedChatId, userId);
        } catch (error: unknown) {
          if (isAuthorizationError(error)) {
            socket.emit("error", {
              code: "FORBIDDEN",
              message: error.message,
            });
            return;
          }

          if (isValidationError(error)) {
            socket.emit("error", {
              code: "VALIDATION_ERROR",
              message: error.message,
            });
            return;
          }

          socket.emit("error", {
            code: "UNKNOWN_ERROR",
            message: "Unable to start typing indicator",
          });
          return;
        }
      }

      socket.to(normalizedChatId).emit("typing_start", { userId });
    });

    socket.on("typing_stop", async (chatId: string) => {
      const normalizedChatId = typeof chatId === "string" ? chatId.trim() : "";
      if (!normalizedChatId) {
        socket.emit("error", {
          code: "INVALID_PAYLOAD",
          message: "chatId is required",
        });
        return;
      }

      if (!socket.rooms.has(normalizedChatId)) {
        try {
          await assertUserIsParticipant(normalizedChatId, userId);
        } catch (error: unknown) {
          if (isAuthorizationError(error)) {
            socket.emit("error", {
              code: "FORBIDDEN",
              message: error.message,
            });
            return;
          }

          if (isValidationError(error)) {
            socket.emit("error", {
              code: "VALIDATION_ERROR",
              message: error.message,
            });
            return;
          }

          socket.emit("error", {
            code: "UNKNOWN_ERROR",
            message: "Unable to stop typing indicator",
          });
          return;
        }
      }

      socket.to(normalizedChatId).emit("typing_stop", { userId });
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
