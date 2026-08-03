import { getChannel } from "./connection";

export const QUEUE_CHAT_MESSAGES = "chat_messages";
export const QUEUE_CHAT_MESSAGE_EVENTS = "chat_message_events";

export type QueueMessageType = "text" | "image" | "video" | "file";

export interface ChatMessageQueuePayload {
  chatId: string;
  senderId: string;
  content: string;
  type: QueueMessageType;
  tempId?: string;
  traceId?: string;
  createdAt: Date;
}

export interface ChatMessageEventPayload {
  chatId: string;
  senderId: string;
  tempId?: string;
  traceId?: string;
  inserted: boolean;
  message: {
    id: string;
    chatId: string;
    senderId: string;
    text: string;
    content: string;
    timestamp: string;
  };
}

export const sendMessageToQueue = async (data: ChatMessageQueuePayload) => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGES, {
    durable: true,
  });

  channel.sendToQueue(QUEUE_CHAT_MESSAGES, Buffer.from(JSON.stringify(data)), {
    persistent: true,
  });

  console.log(`Message pushed to queue "${QUEUE_CHAT_MESSAGES}"`);
};

export const sendMessageEventToQueue = async (
  data: ChatMessageEventPayload,
) => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGE_EVENTS, {
    durable: true,
  });

  channel.sendToQueue(
    QUEUE_CHAT_MESSAGE_EVENTS,
    Buffer.from(JSON.stringify(data)),
    {
      persistent: true,
    },
  );

  console.log(`Message event pushed to queue "${QUEUE_CHAT_MESSAGE_EVENTS}"`);
};
