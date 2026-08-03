import mongoose, { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { ChatModel } from "../../../../../packages/mongo/src/models/chat.model";
import { MessageModel } from "../../../../../packages/mongo/src/models/message.model";
import { MessageStatusModel } from "../../../../../packages/mongo/src/models/messageStatus.model";
import { redis } from "../../../../../packages/redis/src/client";
import { assertUserIsParticipant } from "./chat.auth";

interface SendMessageResult {
  message: any;
  inserted: boolean;
}

const DB_TIMEOUT_MS = Number(process.env.WORKER_DB_TIMEOUT_MS ?? 10000);
const REDIS_TIMEOUT_MS = Number(process.env.WORKER_REDIS_TIMEOUT_MS ?? 3000);

class OperationTimeoutError extends Error {
  constructor(step: string, timeoutMs: number) {
    super(`${step} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const withTimeout = async <T>(
  step: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new OperationTimeoutError(step, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
};

const logStep = (
  traceId: string,
  step: string,
  phase: "start" | "ok" | "fail",
  metadata?: Record<string, unknown>,
) => {
  const prefix = `[${traceId}] [chat-service] ${step} ${phase.toUpperCase()}`;
  if (metadata) {
    console.log(prefix, metadata);
    return;
  }
  console.log(prefix);
};

const timedStep = async <T>(
  traceId: string,
  step: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  metadata?: Record<string, unknown>,
): Promise<T> => {
  const startedAt = Date.now();
  logStep(traceId, step, "start", metadata);

  try {
    const result = await withTimeout(step, fn(), timeoutMs);
    logStep(traceId, step, "ok", { durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logStep(traceId, step, "fail", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const assertValidIds = (chatId: string, senderId: string) => {
  if (!chatId || chatId.trim().length === 0) {
    throw new ValidationError("chatId is required");
  }

  if (!Types.ObjectId.isValid(chatId)) {
    throw new ValidationError("chatId is not a valid Mongo ObjectId");
  }

  if (!senderId || senderId.trim().length === 0) {
    throw new ValidationError("senderId is required");
  }
};

const logMongooseDiagnostics = (traceId: string) => {
  const readyState = mongoose.connection.readyState;
  const stateLabel =
    readyState === 0
      ? "disconnected"
      : readyState === 1
        ? "connected"
        : readyState === 2
          ? "connecting"
          : readyState === 3
            ? "disconnecting"
            : "unknown";

  console.log(`[${traceId}] [chat-service] mongoose.diagnostics`, {
    readyState,
    stateLabel,
    dbName: mongoose.connection.db?.databaseName ?? null,
    models: mongoose.modelNames(),
  });

  if (readyState !== 1) {
    throw new Error(`Mongoose not connected (readyState=${readyState})`);
  }

  if (!mongoose.modelNames().includes("Message")) {
    throw new Error("Mongoose model 'Message' is not registered");
  }

  if (!mongoose.modelNames().includes("MessageStatus")) {
    throw new Error("Mongoose model 'MessageStatus' is not registered");
  }

  if (!mongoose.modelNames().includes("Chat")) {
    throw new Error("Mongoose model 'Chat' is not registered");
  }
};

export class ChatService {
  static async createPrivateChat(user1: string, user2: string) {
    const existing = await ChatModel.findOne({
      type: "private",
      participants: { $all: [user1, user2] },
    });

    if (existing) return existing;

    return ChatModel.create({
      type: "private",
      participants: [user1, user2],
    });
  }

  static async createGroupChat(name: string, participants: string[]) {
    return ChatModel.create({
      type: "group",
      name,
      participants,
    });
  }

  static async getUserChats(userId: string) {
    return ChatModel.find({
      participants: userId,
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  static async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
    type: "text" | "image" | "video" | "file",
    tempId?: string,
    traceId?: string,
    options?: { skipAuth?: boolean },
  ): Promise<SendMessageResult> {
    const requestTraceId = traceId?.trim() || randomUUID();
    const normalizedChatId = chatId.trim();
    const normalizedSenderId = senderId.trim();
    const normalizedContent = content.trim();
    const normalizedTempId = typeof tempId === "string" ? tempId.trim() : "";

    console.log(`[${requestTraceId}] [chat-service] sendMessage.input`, {
      chatId: normalizedChatId,
      senderId: normalizedSenderId,
      type,
      tempId: normalizedTempId || null,
      contentLength: normalizedContent.length,
    });

    if (!normalizedContent) {
      throw new ValidationError("content is required");
    }

    assertValidIds(normalizedChatId, normalizedSenderId);
    logMongooseDiagnostics(requestTraceId);
    const chatObjectId = new Types.ObjectId(normalizedChatId);
    console.log(`[${requestTraceId}] [chat-service] chatId.type-check`, {
      chatIdInputType: typeof chatId,
      chatIdNormalizedType: typeof normalizedChatId,
      chatIdObjectIdType: typeof chatObjectId,
      isObjectIdValid: Types.ObjectId.isValid(normalizedChatId),
      chatIdObjectIdHex: chatObjectId.toHexString(),
    });

    let chat;
    if (!options?.skipAuth) {
      chat = await assertUserIsParticipant(normalizedChatId, normalizedSenderId);
    } else {
      chat = await ChatModel.findById(normalizedChatId);
      if (!chat) {
        throw new ValidationError("Chat not found");
      }
    }

    if (normalizedTempId && redis.isOpen) {
      const dedupeKey = `msg:dedupe:${normalizedChatId}:${normalizedSenderId}:${normalizedTempId}`;
      let dedupeResult: string | null = null;
      let dedupeErrored = false;

      try {
        dedupeResult = await timedStep(
          requestTraceId,
          "redis.set.dedupe",
          () =>
            redis.set(dedupeKey, "1", {
              NX: true,
              EX: 180,
            }),
          REDIS_TIMEOUT_MS,
        );
      } catch (error) {
        dedupeErrored = true;
        console.warn(`[${requestTraceId}] sendMessage dedupe check failed, continuing`, {
          error: error instanceof Error ? error.message : String(error),
          chatId: normalizedChatId,
          senderId: normalizedSenderId,
        });
      }

      if (!dedupeErrored && !dedupeResult) {
        const existingMessage = await timedStep(
          requestTraceId,
          "message.findOne.byTempId",
          () =>
            MessageModel.findOne({
              chatId: normalizedChatId,
              senderId: normalizedSenderId,
              clientTempId: normalizedTempId,
            })
              .sort({ createdAt: -1 })
              .lean(),
          DB_TIMEOUT_MS,
        );

        if (existingMessage) {
          console.log(`[${requestTraceId}] [chat-service] duplicate.tempId.hit`, {
            messageId: String(existingMessage._id ?? ""),
          });
          return { message: existingMessage, inserted: false };
        }
      }
    }

    let message: any;

    try {
      message = await timedStep(
        requestTraceId,
        "message.create",
        () =>
          MessageModel.create({
            chatId: normalizedChatId,
            senderId: normalizedSenderId,
            content: normalizedContent,
            type,
            clientTempId: normalizedTempId || undefined,
          }),
        DB_TIMEOUT_MS,
      );
    } catch (error) {
      const mongoError = error as { code?: number };

      if (mongoError?.code === 11000 && normalizedTempId) {
        const existingMessage = await timedStep(
          requestTraceId,
          "message.findOne.onDuplicate",
          () =>
            MessageModel.findOne({
              chatId: normalizedChatId,
              senderId: normalizedSenderId,
              clientTempId: normalizedTempId,
            })
              .sort({ createdAt: -1 })
              .lean(),
          DB_TIMEOUT_MS,
        );

        if (existingMessage) {
          console.log(`[${requestTraceId}] [chat-service] duplicate.mongo.index.hit`, {
            messageId: String(existingMessage._id ?? ""),
          });
          return { message: existingMessage, inserted: false };
        }
      }

      throw error;
    }

    const statuses = chat.participants.map((pId) => ({
      chatId: normalizedChatId,
      messageId: String(message._id),
      userId: pId,
      status: pId === normalizedSenderId ? "read" : "sent",
    }));

    await timedStep(
      requestTraceId,
      "messageStatus.insertMany",
      () => MessageStatusModel.insertMany(statuses, { ordered: false }),
      DB_TIMEOUT_MS,
      { statusCount: statuses.length },
    );

    chat.lastMessage = {
      text: normalizedContent,
      senderId: normalizedSenderId,
      timestamp: new Date(),
    };

    await timedStep(requestTraceId, "chat.save", () => chat.save(), DB_TIMEOUT_MS);

    console.log(`[${requestTraceId}] [chat-service] sendMessage.completed`, {
      messageId: String(message._id),
    });

    return { message, inserted: true };
  }

  static async getMessages(
    chatId: string,
    userId: string,
    page = 1,
    limit = 50,
    options?: { skipAuth?: boolean },
  ) {
    if (!options?.skipAuth) {
      await assertUserIsParticipant(chatId, userId, { requireChat: false });
    }

    return MessageModel.find({ chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
  }

  static async markMessageDelivered(
    chatId: string,
    messageId: string,
    userId: string,
    options?: { skipAuth?: boolean },
  ) {
    if (!options?.skipAuth) {
      await assertUserIsParticipant(chatId, userId, { requireChat: false });
    }

    const result = await MessageStatusModel.updateOne(
      {
        chatId,
        messageId,
        userId,
        status: "sent",
      },
      {
        $set: { status: "delivered" },
      },
    );

    return result.modifiedCount > 0;
  }

  static async markMessagesRead(
    chatId: string,
    userId: string,
    messageIds?: string[],
    options?: { skipAuth?: boolean },
  ) {
    const ids =
      Array.isArray(messageIds) && messageIds.length > 0
        ? messageIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          )
        : [];

    const readFilter: Record<string, unknown> = {
      chatId,
      userId,
      status: { $ne: "read" },
    };

    if (ids.length > 0) {
      readFilter.messageId = { $in: ids };
    }

    if (!options?.skipAuth) {
      await assertUserIsParticipant(chatId, userId, { requireChat: false });
    }

    const statusesToUpdate = await MessageStatusModel.find(readFilter)
      .select({ messageId: 1 })
      .lean();

    if (statusesToUpdate.length === 0) {
      return [];
    }

    const uniqueMessageIds = Array.from(
      new Set(statusesToUpdate.map((row) => String(row.messageId))),
    );

    await MessageStatusModel.updateMany(readFilter, {
      $set: { status: "read" },
    });

    return uniqueMessageIds;
  }

  static async markAsRead(
    chatId: string,
    userId: string,
    options?: { skipAuth?: boolean },
  ) {
    const messageIds = await this.markMessagesRead(chatId, userId, undefined, {
      skipAuth: options?.skipAuth,
    });

    if (messageIds.length === 0) {
      return true;
    }

    const { getIO } = await import("../lib/socket");
    const io = getIO();
    io.to(chatId).emit("message_read", {
      messageIds,
      status: "read",
      chatId,
      userId,
      timestamp: new Date(),
    });

    return true;
  }
}
