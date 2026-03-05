import { ChatModel } from "../../../../../packages/mongo/src/models/chat.model";
import { MessageModel } from "../../../../../packages/mongo/src/models/message.model";
import { MessageStatusModel } from "../../../../../packages/mongo/src/models/MessageStatus.model";
import {getIO} from "../lib/socket";

export class ChatService {

    static async createPrivateChat(user1: string, user2: string) {
        const existing = await ChatModel.findOne({
            type: "private",
            participants: { $all: [user1, user2] }
        });

        if (existing) return existing;

        return ChatModel.create({
            type: "private",
            participants: [user1, user2]
        });
    }

    static async createGroupChat(name: string, participants: string[]) {
        return ChatModel.create({
            type: "group",
            name,
            participants
        });
    }

    static async getUserChats(userId: string) {
        return ChatModel.find({
            participants: userId
        })
            .sort({ updatedAt: -1 })
            .lean();
    }

    static async sendMessage(
        chatId: string,
        senderId: string,
        content: string,
        type: "text" | "image" | "video" | "file"
    ) {

        const chat = await ChatModel.findById(chatId);
        if (!chat) throw new Error("Chat not found");

        const message = await MessageModel.create({
            chatId,
            senderId,
            content,
            type
        });

        // 🔥 BULK INSERT OPTIMIZATION
        const statuses = chat.participants.map(pId => ({
            chatId,
            messageId: message._id,
            userId: pId,
            status: pId === senderId ? "read" : "sent"
        }));

        await MessageStatusModel.insertMany(statuses);

        // Update last message in chat
        chat.lastMessage = {
            text: content,
            senderId,
            timestamp: new Date()
        };

        await chat.save();

        // 🔥 REAL-TIME EVENT
        const io = getIO();
        io.to(chatId).emit("new_message", message);
        return message;
    }

    static async getMessages(chatId: string) {
        return MessageModel.find({ chatId })
            .sort({ createdAt: 1 })
            .limit(50)
            .lean();
    }

    static async markAsRead(chatId: string, userId: string) {
        await MessageStatusModel.updateMany(
            {
                chatId,
                userId,
                status: { $ne: "read" }
            },
            {
                $set: { status: "read" }
            }
        );

        const io = getIO();

        io.to(chatId).emit("messages_read", {
            chatId,
            userId
        });

        return true;
    }
}