import { Server } from "./server/index.js";

async function bootstrap() {
	const server = new Server();
	await server.start();
}

bootstrap();
