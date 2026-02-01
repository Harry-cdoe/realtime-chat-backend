import { Router } from "express";
import { ChatController } from "./chat.controller";
import { requireAuth } from "../lib/auth.middleware";

const router = Router();

router.post("/private", requireAuth, ChatController.createPrivate);

router.post("/group", requireAuth, ChatController.createGroup);

router.get("/my", requireAuth, ChatController.myChats);

router.post("/message", requireAuth, ChatController.sendMessage);

router.get("/messages/:chatId", requireAuth, ChatController.getMessages);

router.post("/read/:chatId", requireAuth, ChatController.markRead);

export default router;
