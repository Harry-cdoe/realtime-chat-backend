import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  chatId: string;
  senderId: string;
  content: string;
  type: "text" | "image" | "video" | "file";
  clientTempId?: string;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "video", "file"],
      default: "text",
    },
    clientTempId: {
      type: String,
      required: false,
    },
  },
  { timestamps: true },
);

// Critical performance index for chat history queries.
MessageSchema.index({ chatId: 1, createdAt: -1 });

// Enforces idempotency when client temp ids are provided.
MessageSchema.index(
  { chatId: 1, senderId: 1, clientTempId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientTempId: { $exists: true, $type: "string" },
    },
  },
);

export const MessageModel = mongoose.model<IMessage>("Message", MessageSchema);
