import type { BaileysEventEmitter } from "baileys";
import * as handlers from "./handlers/index.js";

export class Store {
	private readonly chatHandler;
	private readonly messageHandler;
	private readonly contactHandler;
	private readonly groupMetadataHandler;
	private readonly lidMappingHandler;

	constructor(sessionId: string, event: BaileysEventEmitter) {
		this.chatHandler = handlers.chatHandler(sessionId, event);
		this.messageHandler = handlers.messageHandler(sessionId, event);
		this.contactHandler = handlers.contactHandler(sessionId, event);
		this.groupMetadataHandler = handlers.groupMetadataHandler(sessionId, event);
		this.lidMappingHandler = handlers.lidMappingHandler(sessionId, event);
		this.listen();
	}

	public listen() {
		this.chatHandler.listen();
		this.messageHandler.listen();
		this.contactHandler.listen();
		this.groupMetadataHandler.listen();
		this.lidMappingHandler.listen();
	}

	public unlisten() {
		this.chatHandler.unlisten();
		this.messageHandler.unlisten();
		this.contactHandler.unlisten();
		this.groupMetadataHandler.unlisten();
		this.lidMappingHandler.unlisten();
	}
}
