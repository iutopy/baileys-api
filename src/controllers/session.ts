import WhatsappService from "@/whatsapp/service";
import type { RequestHandler } from "express";
import { captureException, logger } from "@/utils";

export const list: RequestHandler = (req, res) => {
	res.status(200).json(WhatsappService.listSessions());
};

export const find: RequestHandler = (req, res) =>
	res.status(200).json({ message: "Session found" });

export const status: RequestHandler = (req, res) => {
	const session = WhatsappService.getSession(req.params.sessionId)!;
	res.status(200).json({ status: WhatsappService.getSessionStatus(session) });
};

export const add: RequestHandler = async (req, res) => {
	try {
		const { sessionId, readIncomingMessages, ...socketConfig } = req.body;

		if (WhatsappService.sessionExists(sessionId))
			return res.status(400).json({ error: "Session already exists" });

		await WhatsappService.createSession({ sessionId, res, readIncomingMessages, socketConfig });
	} catch (e) {
		const message = "An error occurred during session creation";
		captureException(e, { tags: { scope: "session.add" } });
		logger.error(e, message);
		if (!res.headersSent) {
			res.status(500).json({ error: message });
		}
	}
};

export const addSSE: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.params;
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});

		if (WhatsappService.sessionExists(sessionId)) {
			res.write(`data: ${JSON.stringify({ error: "Session already exists" })}\n\n`);
			res.end();
			return;
		}

		await WhatsappService.createSession({ sessionId, res, SSE: true });
	} catch (e) {
		const message = "An error occurred during SSE session creation";
		captureException(e, { tags: { scope: "session.addSSE" } });
		logger.error(e, message);
		if (!res.writableEnded) {
			res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
			res.end();
		}
	}
};

export const del: RequestHandler = async (req, res) => {
	await WhatsappService.deleteSession(req.params.sessionId);
	res.status(200).json({ message: "Session deleted" });
};
