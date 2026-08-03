import { Request, Response } from "express";
import { ChatService } from "./chat.service";
import { sendMessageToQueue } from "../../../../../packages/rabbitmq/src/producer";
import {
  isAuthorizationError,
  isValidationError,
} from "./chat.auth";

type MessageType = "text" | "image" | "video" | "file";

interface SendMessageBody {
  chatId?: unknown;
  content?: unknown;
  text?: unknown;
  type?: unknown;
  tempId?: unknown;
}

const VALID_MESSAGE_TYPES: readonly MessageType[] = [
  "text",
  "image",
  "video",
  "file",
];

const isValidMessageType = (value: string): value is MessageType => {
  return VALID_MESSAGE_TYPES.includes(value as MessageType);
};

export class ChatController {
  static async createPrivate(req: Request, res: Response) {
    try {
      const user1 = req.user?.userId;
      const maybeUser2 = req.body?.userId;

      if (!user1) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (typeof maybeUser2 !== "string") {
        return res.status(400).json({ message: "Recipient user2 is required" });
      }

      const chat = await ChatService.createPrivateChat(user1, maybeUser2);
      res.json(chat);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }

  static async createGroup(req: Request, res: Response) {
    try {
      const { name, participants } = req.body;
      console.log("Creating group chat with name:", name, "and participants:", participants);
      const chat = await ChatService.createGroupChat(name, participants);

      res.json(chat);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }

  static async myChats(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const chats = await ChatService.getUserChats(userId);

      res.json(chats);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const {
        chatId,
        content,
        text,
        type: rawMessageType,
        tempId: rawTempId,
      } = req.body as SendMessageBody;

      const messageContent = content ?? text;
      const resolvedMessageType = rawMessageType ?? "text";

      console.log("Received sendMessage request with body:", req.body);
      if (chatId === undefined || messageContent === undefined) {
        return res.status(400).json({
          success: false,
          message: "Validation failed: chatId and content/text are required",
          data: null,
        });
      }

      if (
        typeof chatId !== "string" ||
        typeof messageContent !== "string" ||
        typeof resolvedMessageType !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Validation failed: chatId, content/text, and type must be strings",
          data: null,
        });
      }

      const normalizedChatId = chatId.trim();
      const normalizedMessageContent = messageContent.trim();
      const normalizedMessageType = resolvedMessageType.trim();
      const normalizedTempId =
        typeof rawTempId === "string" ? rawTempId.trim() : undefined;

      if (
        normalizedChatId.length === 0 ||
        normalizedMessageContent.length === 0 ||
        normalizedMessageType.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Validation failed: chatId, content, and type cannot be empty",
          data: null,
        });
      }

      if (!isValidMessageType(normalizedMessageType)) {
        return res.status(400).json({
          success: false,
          message: `Validation failed: type must be one of ${VALID_MESSAGE_TYPES.join(", ")}`,
          data: null,
        });
      }

      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: user context is missing",
          data: null,
        });
      }

      console.info("sendMessage: queueing message", {
        chatId: normalizedChatId,
        userId,
        messageType: normalizedMessageType,
      });

      await sendMessageToQueue({
        chatId: normalizedChatId,
        senderId: userId,
        content: normalizedMessageContent,
        type: normalizedMessageType,
        tempId: normalizedTempId,
        createdAt: new Date(),
      });

      return res.status(202).json({
        success: true,
        message: "Message queued successfully",
        data: {
          chatId: normalizedChatId,
          tempId: normalizedTempId ?? null,
          status: "queued",
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown server error";

      console.error("sendMessage: failed to send message", {
        error: errorMessage,
        userId: req.user?.userId ?? null,
      });

      if (isAuthorizationError(error)) {
        return res.status(403).json({
          success: false,
          message: error.message,
          data: null,
        });
      }

      if (isValidationError(error)) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
        data: null,
      });
    }
  }

  static async getMessages(req: Request, res: Response) {
    try {
      const { chatId } = req.params as { chatId: string };
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const messages = await ChatService.getMessages(chatId, userId);

      const normalizedMessages = messages.map((message: any) => ({
        ...message,
        id: String(message?._id ?? message?.id ?? ""),
        text: message?.text ?? message?.content ?? "",
        timestamp: message?.createdAt ?? new Date().toISOString(),
      }));

      res.json(normalizedMessages);
    } catch (error: unknown) {
      if (isAuthorizationError(error)) {
        return res.status(403).json({ message: error.message });
      }

      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      const { chatId } = req.params as { chatId: string };

      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      await ChatService.markAsRead(chatId, userId);

      res.json({ message: "Marked as read" });
    } catch (error: unknown) {
      if (isAuthorizationError(error)) {
        return res.status(403).json({ message: error.message });
      }

      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
