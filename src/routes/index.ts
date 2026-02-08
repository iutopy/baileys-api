import { Router } from "express";
import chatRoutes from "./chats.js";
import groupRoutes from "./groups.js";
import messageRoutes from "./messages.js";
import sessionRoutes from "./sessions.js";
import contactRoutes from "./contacts.js";
import { apiKeyValidator } from "@/middlewares/api-key-validator";

const router = Router();
router.use("/sessions", sessionRoutes);
router.use("/:sessionId/chats", apiKeyValidator, chatRoutes);
router.use("/:sessionId/contacts", apiKeyValidator, contactRoutes);
router.use("/:sessionId/groups", apiKeyValidator, groupRoutes);
router.use("/:sessionId/messages", apiKeyValidator, messageRoutes);

export default router;
