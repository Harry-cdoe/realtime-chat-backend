import { getChannel } from "./connection";

export const QUEUE_CHAT_MESSAGES = "chat_messages";

export type QueueMessageType = "text" | "image" | "video" | "file";

export interface ChatMessageQueuePayload {
  chatId: string;
  senderId: string;
  content: string;
  type: QueueMessageType;
  tempId?: string;
  createdAt: Date;
}  0                                   

export const sendMessageToQueue = async (data: ChatMessageQueuePayload) => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGES, {
    durable: true,
  });

  channel.sendToQueue(QUEUE_CHAT_MESSAGES, Buffer.from(JSON.stringify(data)), {
    persistent: true,
  });

  console.log("📤 Message pushed to queue");
};
