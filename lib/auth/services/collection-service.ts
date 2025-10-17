import type { Kysely } from "kysely";
import { mergeRecords } from "../../operations";
import type { EncodedRecord } from "../../types";
import type { Database } from "../db";
import { createCollectionsRepo } from "../db/collections-repo";

export function createCollectionService(db: Kysely<Database>) {
	const repo = createCollectionsRepo(db);

	const setCollection = async (
		mailboxId: string,
		domain: string,
		collection: string,
		content: EncodedRecord,
	) => {
		const existing = await repo.get(mailboxId, domain, collection);
		if (existing) {
			const existingRecord = JSON.parse(existing.content);
			const mergedContent = mergeRecords(existingRecord, content);
			await repo.update(
				mailboxId,
				domain,
				collection,
				JSON.stringify(mergedContent),
			);
		} else {
			await repo.insert({
				id: crypto.randomUUID(),
				mailbox_id: mailboxId,
				domain,
				collection,
				content: JSON.stringify(content),
			});
		}
	};

	const getCollection = async (
		mailboxId: string,
		domain: string,
		collection: string,
	): Promise<EncodedRecord> => {
		const existing = await repo.get(mailboxId, domain, collection);
		if (existing) {
			const data = JSON.parse(existing.content);
			return data;
		} else {
			return {};
		}
	};

	return {
		setCollection,
		getCollection,
	};
}
