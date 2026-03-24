import { ChatModel } from "../../../../../packages/mongo/src/models/chat.model";
import { MessageModel } from "../../../../../packages/mongo/src/models/message.model";
import { MessageStatusModel } from "../../../../../packages/mongo/src/models/MessageStatus.model";
import { redis } from "../../../../../packages/redis/src/client";
import { getIO } from "../lib/socket";

interface SendMessageResult {
  message: any;
  inserted: boolean;
}

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
  ): Promise<SendMessageResult> {
    const normalizedTempId = typeof tempId === "string" ? tempId.trim() : "";

    if (normalizedTempId && redis.isOpen) {
      const dedupeKey = `msg:dedupe:${chatId}:${senderId}:${normalizedTempId}`;
      let dedupeResult: string | null = null;
      let dedupeErrored = false;

      try {
        dedupeResult = await redis.set(dedupeKey, "1", {
          NX: true,
          EX: 180,
        });
      } catch (error) {
        dedupeErrored = true;
        console.warn("sendMessage dedupe check failed, continuing", {
          error: error instanceof Error ? error.message : String(error),
          chatId,
          senderId,
        });
      }

      if (!dedupeErrored && !dedupeResult) {
        const existingMessage = await MessageModel.findOne({
          chatId,
          senderId,
          clientTempId: normalizedTempId,
        }).sort({ createdAt: -1 });

        if (existingMessage) {
          return { message: existingMessage, inserted: false };
        }
      }
    }

    const chat = await ChatModel.findById(chatId);
    if (!chat) throw new Error("Chat not found");

    let message: any;

    try {
      message = await MessageModel.create({
        chatId,
        senderId,
        content,
        type,
        clientTempId: normalizedTempId || undefined,
      });
    } catch (error) {
      const mongoError = error as { code?: number };

      if (mongoError?.code === 11000 && normalizedTempId) {
        const existingMessage = await MessageModel.findOne({
          chatId,
          senderId,
          clientTempId: normalizedTempId,
        }).sort({ createdAt: -1 });

        if (existingMessage) {
          return { message: existingMessage, inserted: false };
        }
      }

      throw error;
    }

    const statuses = chat.participants.map((pId) => ({
      chatId,
      messageId: message._id,
      userId: pId,
      status: pId === senderId ? "read" : "sent",
    }));

    await MessageStatusModel.insertMany(statuses);

    chat.lastMessage = {
      text: content,
      senderId,
      timestamp: new Date(),
    };

    await chat.save();

    return { message, inserted: true };
  }

  static async getMessages(chatId: string, page = 1, limit = 50) {
    return MessageModel.find({ chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
  }

  static async markAsRead(chatId: string, userId: string) {
    await MessageStatusModel.updateMany(
      {
        chatId,
        userId,
        status: { $ne: "read" },
      },
      {
        $set: { status: "read" },
      },
    );

    const io = getIO();
    io.to(chatId).emit("message_read", {
      chatId,
      userId,
      timestamp: new Date(),
    });

    return true;
  }
}
