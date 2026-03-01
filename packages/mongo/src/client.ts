import mongoose from "mongoose";

let isConnected = false;

const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  throw new Error("MONGO_URL not defined");
}

/**
 * Connect to MongoDB (Singleton)
 */
export const connectMongo = async (): Promise<void> => {

  if (isConnected) {

    console.log("MongoDB already connected");

    return;

  }

  try {

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URL, {

      maxPoolSize: 20, // max concurrent connections

      serverSelectionTimeoutMS: 5000, // fail fast if DB unavailable

      socketTimeoutMS: 45000, // close inactive sockets

    });

    isConnected = true;

    console.log("MongoDB connected successfully");

  }
  catch (error) {

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

  }
  catch (error) {

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