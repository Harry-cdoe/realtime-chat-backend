import amqp from "amqplib";

let connection: any;
let channel: any;
const RABBITMQ_URL = process.env.RABBITMQ_URL as string;
export const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(RABBITMQ_URL);

    connection.on("close", () => {
      console.log("RabbitMQ connection closed. Reconnecting...");
      reconnect();
    });

    connection.on("error", (err: any) => {
      console.error("RabbitMQ error:", err);
    });

    channel = await connection.createChannel();

    console.log("✅ RabbitMQ Connected");
  } catch (error) {
    console.error("RabbitMQ connection failed. Retrying...");
    reconnect();
  }
};

const reconnect = () => {
  setTimeout(() => {
    connectRabbitMQ();
  }, 5000); // retry after 5 sec
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
