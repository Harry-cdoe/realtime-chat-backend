import { ConsumeMessage } from "amqplib";
import { ChatService } from "../../../apps/api/src/modules/chat/chat.service";
import { getIO } from "../../../apps/api/src/modules/lib/socket";
import { getChannel } from "./connection";
import { QUEUE_CHAT_MESSAGES } from "./producer";

type MessageType = "text" | "image" | "video" | "file";

const VALID_MESSAGE_TYPES: readonly MessageType[] = [
  "text",
  "image",
  "video",
  "file",
];

const isValidMessageType = (value: unknown): value is MessageType => {
  return (
    typeof value === "string" &&
    VALID_MESSAGE_TYPES.includes(value as MessageType)
  );
};

const toIsoTimestamp = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export const startConsumer = async () => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGES, {
    durable: true,
  });

  console.log("RabbitMQ consumer started");

  channel.consume(QUEUE_CHAT_MESSAGES, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const data = JSON.parse(msg.content.toString());

      console.log("Message received from queue:", data);

      const chatId = typeof data?.chatId === "string" ? data.chatId.trim() : "";
      const senderId =
        typeof data?.senderId === "string" ? data.senderId.trim() : "";
      const contentSource = data?.content ?? data?.message ?? data?.text;
      const content =
        typeof contentSource === "string" ? contentSource.trim() : "";
      const type = isValidMessageType(data?.type) ? data.type : "text";
      const tempId = typeof data?.tempId === "string" ? data.tempId.trim() : "";

      if (!chatId || !senderId || !content) {
        console.error("Consumer error: invalid queued payload", data);
        channel.ack(msg);
        return;
      }

      const result = await ChatService.sendMessage(
        chatId,
        senderId,
        content,
        type,
        tempId || undefined,
      );

      const io = getIO();

      if (result.inserted) {
        const normalizedText = String(result.message?.content ?? content);
        const normalizedTimestamp = toIsoTimestamp(result.message?.createdAt);

        io.to(chatId).emit("receive_message", {
          id: String(result.message?._id ?? result.message?.id ?? ""),
          chatId: String(result.message?.chatId ?? chatId),
          senderId: String(result.message?.senderId ?? senderId),
          text: normalizedText,
          content: normalizedText,
          timestamp: normalizedTimestamp,
        });
      }

      io.to(senderId).emit("message_sent", {
        messageId: String(result.message?._id ?? result.message?.id ?? ""),
        tempId: tempId || undefined,
        status: "sent",
        timestamp: toIsoTimestamp(result.message?.createdAt),
        chatId,
      });

      channel.ack(msg);
    } catch (error) {
      console.error("Consumer error:", error);
      // Do not requeue malformed or permanently failing payloads.
      channel.ack(msg);
    }
  });
};
