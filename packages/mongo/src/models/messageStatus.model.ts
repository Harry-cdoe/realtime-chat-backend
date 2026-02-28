import mongoose, { Schema, Document } from "mongoose";

export interface IMessageStatus extends Document {
  chatId: string;
  messageId: string;
  userId: string;
  status: "sent" | "delivered" | "read";
  createdAt: Date;
  updatedAt: Date;
}

const MessageStatusSchema = new Schema<IMessageStatus>(
  {
    chatId: {
      type: String,
      required: true,
      index: true
    },
    messageId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent"
    }
  },
  { timestamps: true }
);

// 🔥 SUPER IMPORTANT COMPOSITE INDEX
MessageStatusSchema.index({ chatId: 1, userId: 1 });
// 🔥 FAST LOOKUP PER MESSAGE + USER
MessageStatusSchema.index({ messageId: 1, userId: 1 });
export const MessageStatusModel = mongoose.model<IMessageStatus>(
  "MessageStatus",
  MessageStatusSchema
);
