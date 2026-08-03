import mongoose from "mongoose";

let isConnected = false;

const getMongoUrl = (): string => {
  const mongoUrl =
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URL ||
    process.env.MONGODB_URI;

  if (!mongoUrl) {
    throw new Error(
      "Mongo connection string not defined (set MONGO_URL, MONGO_URI, MONGODB_URL, or MONGODB_URI)",
    );
  }

  return mongoUrl;
};

/**
 * Connect to MongoDB (Singleton)
 */
export const connectMongo = async (): Promise<void> => {
  if (isConnected) {
    console.log("MongoDB already connected");

    return;
  }

  try {
    const mongoUrl = getMongoUrl();
    console.log("Connecting to MongoDB...");

    await mongoose.connect(mongoUrl, {
      maxPoolSize: 20, // max concurrent connections

      serverSelectionTimeoutMS: 5000, // fail fast if DB unavailable

      socketTimeoutMS: 45000, // close inactive sockets
    });

    isConnected = true;

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);

    process.exit(1);
  }
};

/**
 * Disconnect MongoDB safely
 */
export const disconnectMongo = async (): Promise<void> => {
  if (!isConnected) return;

  try {
    await mongoose.disconnect();

    isConnected = false;

    console.log("MongoDB disconnected");
  } catch (error) {
    console.error("MongoDB disconnect error:", error);
  }
};

/**
 * Connection event listeners
 */
mongoose.connection.on("connected", () => {
  console.log("MongoDB connection established");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost");

  isConnected = false;
});

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string) {
  console.log(`Mongo shutdown signal received: ${signal}`);

  await disconnectMongo();

  process.exit(0);
}

process.on("SIGINT", shutdown);

process.on("SIGTERM", shutdown);
