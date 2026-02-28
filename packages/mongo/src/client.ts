import mongoose from "mongoose";

let isConnected = false;

export const connectMongo = async () => {

    if (isConnected) {
        return;
    }

    try {

        const mongoUrl = process.env.MONGO_URL;

        if (!mongoUrl) {
            throw new Error("MONGO_URL not defined");
        }

        await mongoose.connect(mongoUrl, {
            maxPoolSize: 20,
        });

        isConnected = true;

        console.log("MongoDB connected");

        mongoose.connection.on("error", (err) => {
            console.error("MongoDB error:", err);
        });

        mongoose.connection.on("disconnected", () => {
            console.warn("MongoDB disconnected");
        });

    } catch (error) {

        console.error("MongoDB connection failed:", error);
        process.exit(1);

    }
};

// graceful shutdown
process.on("SIGINT", async () => {

    await mongoose.connection.close();

    console.log("MongoDB disconnected on shutdown");

    process.exit(0);

});