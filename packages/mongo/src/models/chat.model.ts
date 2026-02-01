import mongoose, { Schema, Document } from "mongoose";

interface ILastMessage {
  text: string;
  senderId: string;
  timestamp: Date;
}

export interface IChat extends Document {
  type: "private" | "group";
  participants: string[];
  name?: string;
  lastMessage?: ILastMessage;
  createdAt: Date;
  updatedAt: Date;
}

const LastMessageSchema = new Schema<ILastMessage>(
  {
    text: { type: String },
    senderId: { type: String },
    timestamp: { type: Date }
  },
  { _id: false }
);

const ChatSchema = new Schema<IChat>(
  {
    type: {
      type: String,
      enum: ["private", "group"],
      required: true
    },

    participants: [
      {
        type: String,
        required: true
      }
    ],

    name: {
      type: String
    },

    lastMessage: LastMessageSchema
  },
  { timestamps: true }
);

// 🔥 IMPORTANT INDEX FOR FAST USER CHAT FETCH
ChatSchema.index({ participants: 1 });

export const ChatModel = mongoose.model<IChat>("Chat", ChatSchema);
