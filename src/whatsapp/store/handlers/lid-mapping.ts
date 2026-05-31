import type { BaileysEventEmitter } from "baileys";
import { captureException, logger, emitEvent } from "@/utils";

const LID_MAPPING_UPDATE = "lid-mapping.update" as const;

export default function lidMappingHandler(sessionId: string, event: BaileysEventEmitter) {
	let listening = false;

	const onUpdate = (mapping: unknown) => {
		try {
			emitEvent(LID_MAPPING_UPDATE, sessionId, { mapping });
		} catch (e) {
			captureException(e, {
				tags: { scope: "store.lidMapping.update" },
				extra: { sessionId },
			});
			logger.error(e, "An error occurred during lid-mapping update");
			emitEvent(
				LID_MAPPING_UPDATE,
				sessionId,
				undefined,
				"error",
				`An error occurred during lid-mapping update: ${(e as Error).message}`,
			);
		}
	};

	const listen = () => {
		if (listening) return;
		(event as { on(name: string, handler: (arg: unknown) => void): void }).on(
			LID_MAPPING_UPDATE,
			onUpdate,
		);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;
		(event as { off(name: string, handler: (arg: unknown) => void): void }).off(
			LID_MAPPING_UPDATE,
			onUpdate,
		);
		listening = false;
	};

	return { listen, unlisten };
}
