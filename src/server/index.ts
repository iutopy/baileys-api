import http from "http";
import { ExpressServer } from "./express-server.js";
import env from "@/config/env";
import { SocketServer } from "./websocket-server.js";
import WhatsappService from "@/whatsapp/service";
import { captureException, initializeSocketEmitter, logger } from "@/utils";

export class Server {
	private httpServer: ExpressServer;
	private socketServer: SocketServer;
	private httpPort = env.PORT;
	private server: http.Server;

	constructor() {
		this.httpServer = new ExpressServer();
		this.server = http.createServer(this.httpServer.getApp());
		this.setupSocketServer();
	}

	private setupSocketServer() {
		if (env.ENABLE_WEBSOCKET) {
			this.socketServer = new SocketServer(this.server);
		}
	}

	public async start(): Promise<void> {
		// Initialize socket emitter before creating WhatsApp service
		if (this.socketServer) {
			initializeSocketEmitter(this.socketServer);
			logger.info("WebSocket server is running");
		}

		// Initialize WhatsApp connection
		const whatsappService = new WhatsappService();
		await whatsappService.init();

		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				captureException(error, {
					tags: { scope: "server.listen" },
					extra: { port: this.httpPort },
				});
				logger.error(error, "HTTP server failed to start");
				reject(error);
			};

			this.server.once("error", onError);
			this.server.listen(this.httpPort, () => {
				this.server.off("error", onError);
				logger.info({ port: this.httpPort }, "Server is running");
				resolve();
			});
		});
	}
}
