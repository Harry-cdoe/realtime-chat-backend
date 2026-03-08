import { getChannel } from "./connection";
import { QUEUE_CHAT_MESSAGES } from "./producer";
import { ChatService } from "../../../apps/api/src/modules/chat/chat.service";
import { ConsumeMessage } from "amqplib"; // 1. Import the type

export const startConsumer = async () => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGES, {
    durable: true,
  });

  console.log("🐰 RabbitMQ consumer started");

  // 2. Explicitly type 'msg' as ConsumeMessage | null
  channel.consume(QUEUE_CHAT_MESSAGES, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const data = JSON.parse(msg.content.toString());

      console.log("📥 Message received from queue:", data);

      await ChatService.sendMessage(
        data.chatId,
        data.senderId,
        data.message,
        "text",
      );

      channel.ack(msg);
    } catch (error) {
      console.error("Consumer error:", error);
      // Optional: use channel.nack(msg) if you want to retry failed messages
    }
  });
};
