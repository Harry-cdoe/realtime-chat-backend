import amqp from "amqplib";

let connection: any;
let channel: any;
const RABBITMQ_URL = process.env.RABBITMQ_URL as string;

export const connectRabbitMQ = async (retries = 5, delay = 2000): Promise<boolean> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);

      connection.on("close", () => {
        console.log("RabbitMQ connection closed. Reconnecting...");
        channel = null;
      });

      connection.on("error", (err: any) => {
        console.error("RabbitMQ error:", err);
      });

      channel = await connection.createChannel();

      console.log("✅ RabbitMQ Connected");
      return true;
    } catch (error) {
      console.error(
        `RabbitMQ connection failed (attempt ${attempt}/${retries}):`,
        error,
      );

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  console.error(
    "RabbitMQ failed to connect after maximum retries. Make sure RabbitMQ is running.",
  );
  return false;
};

export const getChannel = () => {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }

  return channel;
};

export const closeRabbitMQ = async () => {
  try {
    if (channel) {
      await channel.close();
      console.log("RabbitMQ channel closed");
    }

    if (connection) {
      await connection.close();
      console.log("RabbitMQ connection closed");
    }
  } catch (error) {
    console.error("Error closing RabbitMQ:", error);
  }
};
