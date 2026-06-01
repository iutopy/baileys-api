import env from "@/config/env";
import { captureException } from "@/utils/sentry";
import { logger } from "@/utils/logger";
import type { EventsType } from "@/types/websocket";
import axios from "axios";
import type { SocketServer } from "../server/websocket-server.js";

let socketServer: SocketServer | null = null;
export function initializeSocketEmitter(server: SocketServer) {
	socketServer = server;
}

export function emitEvent(
	event: EventsType,
	sessionId: string,
	data?: unknown,
	status: "success" | "error" = "success",
	message?: string,
) {
	// Always try to send webhook if enabled
	if (env.ENABLE_WEBHOOK && event === "messages.upsert" && status === "success") {
		sendWebhook(event, sessionId, data, status, message);
	}

	// Only emit to socket if socket server is available
	if (socketServer) {
		socketServer.emitEvent(event, sessionId, { status, message, data });
	} else if (env.ENABLE_WEBSOCKET) {
		logger.error("Socket server not initialized. Call initializeSocketEmitter first.");
	}
}

export async function sendWebhook(
	event: EventsType,
	sessionId: string,
	data?: unknown,
	status: "success" | "error" = "success",
	message?: string,
) {
	const headers: Record<string, string> = {};
	if (env.API_KEY) {
		headers.Authorization = `Bearer ${env.API_KEY}`;
		headers["X-API-Key"] = env.API_KEY;
	}

	try {
		await axios.post(
			env.URL_WEBHOOK,
			{
				sessionId,
				event,
				data,
				status,
				message,
			},
			{ headers },
		);
	} catch (e) {
		captureException(e, {
			tags: { scope: "webhook" },
			extra: { event, sessionId, status },
		});
		logger.error(e, "Error sending webhook");
	}
}
