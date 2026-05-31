import "@/instrument";
import * as Sentry from "@sentry/node";
import { Server } from "./server/index.js";
import { captureException, logger } from "@/utils";

process.on("unhandledRejection", (reason) => {
	captureException(reason, { tags: { scope: "process.unhandledRejection" } });
	logger.error(reason, "Unhandled promise rejection");
});

process.on("uncaughtException", async (error) => {
	captureException(error, { tags: { scope: "process.uncaughtException" } });
	logger.error(error, "Uncaught exception");

	try {
		await Sentry.flush(2000);
	} finally {
		process.exit(1);
	}
});

async function bootstrap() {
	const server = new Server();
	await server.start();
}

bootstrap().catch((error) => {
	captureException(error, { tags: { scope: "bootstrap" } });
	throw error;
});
