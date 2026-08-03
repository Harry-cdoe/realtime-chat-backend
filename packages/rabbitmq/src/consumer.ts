import { ConsumeMessage } from "amqplib";
import { randomUUID } from "node:crypto";
import { ChatService } from "../../../apps/api/src/modules/chat/chat.service";
import { getChannel } from "./connection";
import {
  ChatMessageEventPayload,
  QUEUE_CHAT_MESSAGE_EVENTS,
  QUEUE_CHAT_MESSAGES,
  sendMessageEventToQueue,
} from "./producer";

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

const MAX_RETRIES = 5;
const PROCESSING_WATCHDOG_MS = 15000;
const EVENT_PUBLISH_TIMEOUT_MS = 5000;

const withTimeout = async <T>(
  label: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
};

const normalizeFromQueue = (data: any) => {
  const chatId = typeof data?.chatId === "string" ? data.chatId.trim() : "";
  const senderId =
    typeof data?.senderId === "string" ? data.senderId.trim() : "";
  const contentSource = data?.content ?? data?.message ?? data?.text;
  const content = typeof contentSource === "string" ? contentSource.trim() : "";
  const type = isValidMessageType(data?.type) ? data.type : "text";
  const tempId = typeof data?.tempId === "string" ? data.tempId.trim() : "";
  const traceId =
    typeof data?.traceId === "string" ? data.traceId.trim() : randomUUID();

  return { chatId, senderId, content, type, tempId, traceId };
};

const isPermanentError = (error: unknown): boolean => {
  const errMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const errName = error instanceof Error ? error.name : "";
  const full = `${errName} ${errMessage}`.toLowerCase();

  return (
    full.includes("validationerror") ||
    full.includes("chat not found") ||
    full.includes("chatid is not a valid mongo objectid") ||
    full.includes("chatid is required")
  );
};

export const startMessagePersistenceConsumer = async () => {
  const channel = getChannel();

  await channel.prefetch(1);

  await channel.assertQueue(QUEUE_CHAT_MESSAGES, {
    durable: true,
  });
  await channel.assertQueue(`${QUEUE_CHAT_MESSAGES}.dead`, {
    durable: true,
  });

  console.log(`[worker] RabbitMQ persistence consumer started on "${QUEUE_CHAT_MESSAGES}"`);

  const consumeOk = await channel.consume(QUEUE_CHAT_MESSAGES, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    let settled = false;

    const safeAck = () => {
      if (settled) return;
      settled = true;
      channel.ack(msg);
    };

    const safeRetryOrDeadLetter = (traceId: string, reason: string) => {
      if (settled) return;
      const retries = Number(msg.properties.headers?.["x-retries"] ?? 0);

      if (retries >= MAX_RETRIES) {
        console.error(`[${traceId}] [persist] retry limit reached, dead-lettering`, {
          retries,
          maxRetries: MAX_RETRIES,
          reason,
        });
        channel.sendToQueue(`${QUEUE_CHAT_MESSAGES}.dead`, msg.content, {
          persistent: true,
          headers: {
            ...msg.properties.headers,
            "x-retries": retries,
            "x-dead-reason": reason,
            "x-trace-id": traceId,
          },
        });
        safeAck();
        return;
      }

      channel.sendToQueue(QUEUE_CHAT_MESSAGES, msg.content, {
        persistent: true,
        headers: {
          ...msg.properties.headers,
          "x-retries": retries + 1,
          "x-trace-id": traceId,
        },
      });
      console.warn(`[${traceId}] [persist] requeued message`, {
        retries: retries + 1,
        maxRetries: MAX_RETRIES,
        reason,
      });
      safeAck();
    };

    let rawPayload = "";
    let traceId = randomUUID();
    const watchdog = setTimeout(() => {
      console.error(`[${traceId}] [persist] watchdog timeout exceeded`, {
        timeoutMs: PROCESSING_WATCHDOG_MS,
      });
      safeRetryOrDeadLetter(traceId, "processing_watchdog_timeout");
    }, PROCESSING_WATCHDOG_MS);

    try {
      rawPayload = msg.content.toString();
      const data = JSON.parse(rawPayload);
      const normalized = normalizeFromQueue(data);
      traceId = normalized.traceId;
      const { chatId, senderId, content, type, tempId } = normalized;
      console.log(`[${traceId}] Message received from queue:`, data);

      if (!chatId || !senderId || !content) {
        console.error("Persistence consumer: invalid queued payload", data);
        safeAck();
        return;
      }

      console.log(`[${traceId}] [persist] saving message`, {
        chatId,
        senderId,
        tempId: tempId || null,
        type,
      });

      const result = await ChatService.sendMessage(
        chatId,
        senderId,
        content,
        type,
        tempId || undefined,
        traceId,
      );

      const normalizedText = String(result.message?.content ?? content);
      const normalizedMessageId = String(
        result.message?._id ?? result.message?.id ?? "",
      );
      const normalizedTimestamp = toIsoTimestamp(result.message?.createdAt);

      console.log(`[${traceId}] [persist] saved message`, {
        chatId,
        senderId,
        tempId: tempId || null,
        inserted: result.inserted,
        messageId: normalizedMessageId,
        timestamp: normalizedTimestamp,
      });

      console.log(`[${traceId}] [persist] publishing event to queue`, {
        queue: QUEUE_CHAT_MESSAGE_EVENTS,
        messageId: normalizedMessageId,
      });
      await withTimeout(
        "sendMessageEventToQueue",
        sendMessageEventToQueue({
          chatId,
          senderId,
          tempId: tempId || undefined,
          traceId,
          inserted: result.inserted,
          message: {
            id: normalizedMessageId,
            chatId: String(result.message?.chatId ?? chatId),
            senderId: String(result.message?.senderId ?? senderId),
            text: normalizedText,
            content: normalizedText,
            timestamp: normalizedTimestamp,
          },
        }),
        EVENT_PUBLISH_TIMEOUT_MS,
      );
      console.log(`[${traceId}] [persist] event published`, {
        queue: QUEUE_CHAT_MESSAGE_EVENTS,
        messageId: normalizedMessageId,
      });

      console.log(`[${traceId}] [persist] ack message`, {
        chatId,
        senderId,
        tempId: tempId || null,
        messageId: normalizedMessageId,
      });
      safeAck();
    } catch (error) {
      console.error("Persistence consumer error:", error);
      if (rawPayload) {
        console.error("[persist] failed payload:", rawPayload);
      }
      const permanent = isPermanentError(error);
      console.log(`[${traceId}] [persist] error-classification`, {
        permanent,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      if (permanent) {
        console.error(`[${traceId}] [persist] permanent error, dead-lettering`, {
          error: error instanceof Error ? error.message : String(error),
        });
        const retries = Number(msg.properties.headers?.["x-retries"] ?? 0);
        channel.sendToQueue(`${QUEUE_CHAT_MESSAGES}.dead`, msg.content, {
          persistent: true,
          headers: {
            ...msg.properties.headers,
            "x-retries": retries,
            "x-dead-reason": "permanent_error",
            "x-trace-id": traceId,
          },
        });
        safeAck();
      } else {
        safeRetryOrDeadLetter(traceId, "processing_exception");
      }
    } finally {
      clearTimeout(watchdog);
    }
  });

  console.log(
    `[worker] consuming "${QUEUE_CHAT_MESSAGES}" with consumerTag=${consumeOk.consumerTag}`,
  );
};

export const startRealtimeEventConsumer = async () => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGE_EVENTS, {
    durable: true,
  });

  console.log(
    `[api] RabbitMQ realtime-event consumer started on "${QUEUE_CHAT_MESSAGE_EVENTS}"`,
  );

  const consumeOk = await channel.consume(
    QUEUE_CHAT_MESSAGE_EVENTS,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      try {
        const data = JSON.parse(msg.content.toString()) as ChatMessageEventPayload;
        const { getIO } = await import("../../../apps/api/src/modules/lib/socket");
        const io = getIO();
        const traceId = data.traceId || randomUUID();
        console.log(`[${traceId}] [realtime] consumed event`, {
          chatId: data.chatId,
          senderId: data.senderId,
          inserted: data.inserted,
          messageId: data.message?.id,
          timestamp: data.message?.timestamp,
        });

        const receivePayload = {
          ...data.message,
          status: "sent",
        };

        if (data.inserted) {
          // Emit to chat room and sender personal room for reliability.
          io.to(data.chatId).emit("receive_message", receivePayload);
          io.to(data.senderId).emit("receive_message", receivePayload);
          console.log(`[${traceId}] [realtime] emitted receive_message`, {
            room: data.chatId,
            senderRoom: data.senderId,
            messageId: data.message.id,
          });
        }

        io.to(data.senderId).emit("message_sent", {
          messageId: data.message.id,
          tempId: data.tempId,
          status: "sent",
          timestamp: data.message.timestamp,
          chatId: data.chatId,
        });

        channel.ack(msg);
      } catch (error) {
        console.error("Realtime-event consumer error:", error);
        channel.ack(msg);
      }
    },
  );

  console.log(
    `[api] consuming "${QUEUE_CHAT_MESSAGE_EVENTS}" with consumerTag=${consumeOk.consumerTag}`,
  );
};
