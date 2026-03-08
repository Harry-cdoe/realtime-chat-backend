import { getChannel } from "./connection";

export const QUEUE_CHAT_MESSAGES = "chat_messages";

export const sendMessageToQueue = async (data: any) => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE_CHAT_MESSAGES, {
    durable: true,
  });

  channel.sendToQueue(QUEUE_CHAT_MESSAGES, Buffer.from(JSON.stringify(data)), {
    persistent: true,
  });

  console.log("📤 Message pushed to queue");
};
