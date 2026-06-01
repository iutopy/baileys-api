import env from "@/config/env";
import * as Sentry from "@sentry/node";

if (env.SENTRY_DSN) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
		sendDefaultPii: true,
	});
}
