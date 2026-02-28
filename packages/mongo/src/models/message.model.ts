import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
    chatId: string;
    senderId: string;
    content: string;
    type: "text" | "image" | "video" | "file";
    createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
    {
        chatId: {
            type: String,
            required: true,
            index: true
        },
        senderId: {
            type: String,
            required: true
        },
        content: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ["text", "image", "video", "file"],
            default: "text"
        }
    },
    { timestamps: true }
);
// 🔥 CRITICAL PERFORMANCE INDEX
MessageSchema.index({ chatId: 1, createdAt: -1 });

export const MessageModel = mongoose.model<IMessage>(
    "Message",
    MessageSchema
);
