import { Request, Response } from "express";
import { ChatService } from "./chat.service";

export class ChatController {

    static async createPrivate(req: Request, res: Response) {
    try {
        const user1 = (req as any).user.userId; // Logged in user from token
        const { userId: user2 } = req.body;            // The friend's ID

        if (!user2) {
            return res.status(400).json({ message: "Recipient user2 is required" });
        }

        const chat = await ChatService.createPrivateChat(user1, user2);
        res.json(chat);
    } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }
    
    static async createGroup(req: Request, res: Response) {
        try {
            const { name, participants } = req.body;

            const chat = await ChatService.createGroupChat(name, participants);

            res.json(chat);
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async myChats(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;

            const chats = await ChatService.getUserChats(userId);

            res.json(chats);
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async sendMessage(req: Request, res: Response) {
        try {
            const { chatId, content, type } = req.body;
            const senderId = (req as any).user.userId;

            const message = await ChatService.sendMessage(
                chatId,
                senderId,
                content,
                type
            );

            res.json(message);
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async getMessages(req: Request, res: Response) {
        try {
            const { chatId } = req.params as { chatId: string };

            const messages = await ChatService.getMessages(chatId);

            res.json(messages);
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async markRead(req: Request, res: Response) {
        try {
            const { chatId } = req.params as { chatId: string };

            const userId = (req as any).user.userId;

            await ChatService.markAsRead(chatId, userId);

            res.json({ message: "Marked as read" });
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }
}
