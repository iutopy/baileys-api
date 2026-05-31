import * as Sentry from "@sentry/node";

export function captureException(
	error: unknown,
	context?: Parameters<typeof Sentry.captureException>[1],
) {
	if (error instanceof Error) {
		Sentry.captureException(error, context);
		return;
	}

	Sentry.captureException(new Error(`Non-Error exception captured: ${String(error)}`), context);
}
