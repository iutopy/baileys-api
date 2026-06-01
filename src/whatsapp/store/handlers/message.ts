import type { BaileysEventEmitter, MessageUserReceipt, proto, WAMessageKey } from "baileys";
import { jidNormalizedUser, toNumber } from "baileys";
import type { BaileysEventHandler, MakeTransformedPrisma } from "@/types";
import { captureException, transformPrisma, logger, emitEvent, haveSameCountryCode } from "@/utils";
import { prisma } from "@/config/database";
import type { Message } from "@prisma/client";
import WhatsappService from "@/whatsapp/service";
import env from "@/config/env";

const getKeyAuthor = (key: WAMessageKey | undefined | null) =>
	(key?.fromMe ? "me" : key?.participant || key?.remoteJid) || "";

const getNormalizedRemoteJid = (remoteJid: string | null | undefined) =>
	remoteJid ? jidNormalizedUser(remoteJid) : undefined;

export default function messageHandler(sessionId: string, event: BaileysEventEmitter) {
	const model = prisma.message;
	let listening = false;

	const set: BaileysEventHandler<"messaging-history.set"> = async ({ messages, isLatest }) => {
		try {
			await prisma.$transaction(async (tx) => {
				if (isLatest) await tx.message.deleteMany({ where: { sessionId } });

				const processedMessages = messages.map((message) => ({
					...(transformPrisma(message) as MakeTransformedPrisma<Message>),
					remoteJid: message.key.remoteJid!,
					id: message.key.id!,
					sessionId,
				}));
				await tx.message.createMany({
					data: processedMessages,
				});
				emitEvent("messages.upsert", sessionId, { messages: processedMessages });
			});
			logger.info({ messages: messages.length }, "Synced messages");
		} catch (e) {
			captureException(e, { tags: { scope: "store.messages.set" }, extra: { sessionId } });
			logger.error(e, "An error occured during messages set");
			emitEvent(
				"messages.upsert",
				sessionId,
				undefined,
				"error",
				`An error occured during messages set: ${(e as Error).message}`,
			);
		}
	};

	const upsert: BaileysEventHandler<"messages.upsert"> = async ({ messages, type }) => {
		switch (type) {
			case "append":
			case "notify":
				for (const message of messages) {
					try {
						const jid = jidNormalizedUser(message.key.remoteJid!);
						const data = transformPrisma(message) as MakeTransformedPrisma<Message>;

						await model.upsert({
							select: { pkId: true },
							create: {
								...data,
								remoteJid: jid,
								id: message.key.id!,
								sessionId,
							},
							update: { ...data },
							where: {
								sessionId_remoteJid_id: {
									remoteJid: jid,
									id: message.key.id!,
									sessionId,
								},
							},
						});

						// Emit webhook event based on VALIDATE_COUNTRY_CODE setting
						if (!env.VALIDATE_COUNTRY_CODE) {
							// When validation is disabled, emit all messages
							emitEvent("messages.upsert", sessionId, { messages: data });
						} else {
							// When validation is enabled, only emit if sender and receiver have the same country code
							const session = WhatsappService.getSession(sessionId);
							const receiverJid = session?.user?.id;
							if (receiverJid && haveSameCountryCode(jid, receiverJid)) {
								emitEvent("messages.upsert", sessionId, { messages: data });
							}
						}

						const chatExists =
							(await prisma.chat.count({ where: { id: jid, sessionId } })) > 0;
						if (type === "notify" && !chatExists) {
							event.emit("chats.upsert", [
								{
									id: jid, // Already normalized above
									conversationTimestamp: toNumber(message.messageTimestamp),
									unreadCount: 1,
								},
							]);
						}
					} catch (e) {
						captureException(e, {
							tags: { scope: "store.messages.upsert" },
							extra: { sessionId, messageId: message.key.id, remoteJid: message.key.remoteJid },
						});
						logger.error(e, "An error occured during message upsert");
						emitEvent(
							"messages.upsert",
							sessionId,
							undefined,
							"error",
							`An error occured during message upsert: ${(e as Error).message}`,
						);
					}
				}
				break;
		}
	};

	const update: BaileysEventHandler<"messages.update"> = async (updates) => {
		for (const { update, key } of updates) {
			try {
				await prisma.$transaction(async (tx) => {
					const remoteJid =
						getNormalizedRemoteJid(key.remoteJid) ||
						getNormalizedRemoteJid(update.key?.remoteJid);
					const prevMessages = remoteJid
						? await tx.message.findMany({
							where: { id: key.id!, remoteJid, sessionId },
							take: 2,
						})
						: await tx.message.findMany({ where: { id: key.id!, sessionId }, take: 2 });
					const prevData = prevMessages[0];

					if (prevMessages.length > 1) {
						return logger.warn(
							{ key, remoteJid, sessionId },
							"Got ambiguous update for existing message",
						);
					}

					if (!prevData) {
						return logger.info({ update }, "Got update for non existent message");
					}

					const messageKey = {
						...(prevData.key as proto.IMessageKey),
						...(update.key || {}),
						id: key.id!,
						remoteJid: prevData.remoteJid,
					};
					const data = { ...prevData, ...update, key: messageKey } as proto.IWebMessageInfo;
					const processedMessage = {
						...(transformPrisma(data) as MakeTransformedPrisma<Message>),
						id: messageKey.id!,
						remoteJid: prevData.remoteJid,
						sessionId,
					};
					delete processedMessage.pkId;

					await tx.message.update({
						select: { pkId: true },
						data: processedMessage,
						where: {
							pkId: prevData.pkId,
						},
					});
					emitEvent("messages.update", sessionId, { messages: processedMessage });
				});
			} catch (e) {
				captureException(e, {
					tags: { scope: "store.messages.update" },
					extra: { sessionId, messageId: key.id, remoteJid: key.remoteJid },
				});
				logger.error(e, "An error occured during message update");
				emitEvent(
					"messages.update",
					sessionId,
					undefined,
					"error",
					`An error occured during message update: ${(e as Error).message}`,
				);
			}
		}
	};

	const del: BaileysEventHandler<"messages.delete"> = async (item) => {
		try {
			if ("all" in item) {
				await prisma.message.deleteMany({ where: { remoteJid: item.jid, sessionId } });
				emitEvent("messages.delete", sessionId, { message: item });
				return;
			}

			const jid = item.keys[0].remoteJid!;
			await prisma.message.deleteMany({
				where: { id: { in: item.keys.map((k) => k.id!) }, remoteJid: jid, sessionId },
			});
			emitEvent("messages.delete", sessionId, { message: item });
		} catch (e) {
			captureException(e, { tags: { scope: "store.messages.delete" }, extra: { sessionId } });
			logger.error(e, "An error occured during message delete");
			emitEvent(
				"messages.delete",
				sessionId,
				undefined,
				"error",
				`An error occured during message delete: ${(e as Error).message}`,
			);
		}
	};

	const updateReceipt: BaileysEventHandler<"message-receipt.update"> = async (updates) => {
		for (const { key, receipt } of updates) {
			try {
				await prisma.$transaction(async (tx) => {
					const remoteJid = getNormalizedRemoteJid(key.remoteJid);
					const messages = await tx.message.findMany({
						select: { pkId: true, userReceipt: true },
						where: remoteJid
							? { id: key.id!, remoteJid, sessionId }
							: { id: key.id!, sessionId },
						take: 2,
					});
					const message = messages[0];

					if (messages.length > 1) {
						return logger.warn(
							{ key, remoteJid, sessionId },
							"Got ambiguous receipt update for existing message",
						);
					}

					if (!message) {
						return logger.debug(
							{ key, receipt },
							"Got receipt update for non existent message",
						);
					}

					let userReceipt = (message.userReceipt ||
						[]) as unknown as MessageUserReceipt[];
					const recepient = userReceipt.find((m) => m.userJid === receipt.userJid);

					if (recepient) {
						userReceipt = [
							...userReceipt.filter((m) => m.userJid !== receipt.userJid),
							receipt,
						];
					} else {
						userReceipt.push(receipt);
					}

					await tx.message.update({
						select: { pkId: true },
						data: transformPrisma({ userReceipt: userReceipt }),
						where: { pkId: message.pkId },
					});
					emitEvent("message-receipt.update", sessionId, { message: { key, receipt } });
				});
			} catch (e) {
				captureException(e, {
					tags: { scope: "store.messageReceipt.update" },
					extra: { sessionId, messageId: key.id, remoteJid: key.remoteJid },
				});
				logger.error(e, "An error occured during message receipt update");
				emitEvent(
					"message-receipt.update",
					sessionId,
					undefined,
					"error",
					`An error occured during message receipt update: ${(e as Error).message}`,
				);
			}
		}
	};

	const updateReaction: BaileysEventHandler<"messages.reaction"> = async (reactions) => {
		for (const { key, reaction } of reactions) {
			try {
				await prisma.$transaction(async (tx) => {
					const remoteJid = getNormalizedRemoteJid(key.remoteJid);
					const messages = await tx.message.findMany({
						select: { pkId: true, reactions: true },
						where: remoteJid
							? { id: key.id!, remoteJid, sessionId }
							: { id: key.id!, sessionId },
						take: 2,
					});
					const message = messages[0];

					if (messages.length > 1) {
						return logger.warn(
							{ key, remoteJid, sessionId },
							"Got ambiguous reaction update for existing message",
						);
					}

					if (!message) {
						return logger.debug(
							{ key, reaction },
							"Got reaction update for non existent message",
						);
					}

					const authorID = getKeyAuthor(reaction.key);
					const reactions = ((message.reactions || []) as proto.IReaction[]).filter(
						(r) => getKeyAuthor(r.key) !== authorID,
					);

					if (reaction.text) reactions.push(reaction);
					await tx.message.update({
						select: { pkId: true },
						data: transformPrisma({ reactions: reactions }),
						where: { pkId: message.pkId },
					});
					emitEvent("messages.reaction", sessionId, { message: { key, reaction } });
				});
			} catch (e) {
				captureException(e, {
					tags: { scope: "store.messageReaction.update" },
					extra: { sessionId, messageId: key.id, remoteJid: key.remoteJid },
				});
				logger.error(e, "An error occured during message reaction update");
				emitEvent(
					"messages.reaction",
					sessionId,
					undefined,
					"error",
					`An error occured during message reaction update: ${(e as Error).message}`,
				);
			}
		}
	};

	const listen = () => {
		if (listening) return;

		event.on("messaging-history.set", set);
		event.on("messages.upsert", upsert);
		event.on("messages.update", update);
		event.on("messages.delete", del);
		event.on("message-receipt.update", updateReceipt);
		event.on("messages.reaction", updateReaction);
		listening = true;
	};

	const unlisten = () => {
		if (!listening) return;

		event.off("messaging-history.set", set);
		event.off("messages.upsert", upsert);
		event.off("messages.update", update);
		event.off("messages.delete", del);
		event.off("message-receipt.update", updateReceipt);
		event.off("messages.reaction", updateReaction);
		listening = false;
	};

	return { listen, unlisten };
}
