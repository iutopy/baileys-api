import type { EventsType } from "@/types/websocket";
import type { SocketServer } from "../server/websocket-server";
import env from "@/config/env";
import axios from "axios";

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
		console.error("Socket server not initialized. Call initializeSocketEmitter first.");
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
		console.error("Error sending webhook", e);
	}
}
