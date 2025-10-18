import type { Storage } from "unstorage";
import { mergeRecords } from "../../operations";
import type { EncodedRecord } from "../../types";
import { createCollectionsRepo } from "../repos/collections-repo";

export function createCollectionService(storage: Storage) {
	const repo = createCollectionsRepo(storage);

	const setCollection = async (
		mailboxId: string,
		domain: string,
		collection: string,
		content: EncodedRecord,
	) => {
		const existing = await repo.get(mailboxId, domain, collection);
		if (existing) {
			const [mergedContent, changed] = mergeRecords(existing.content, content);
			if (changed) {
				await repo.set(mailboxId, domain, collection, {
					...existing,
					content: mergedContent,
				});
			}
		} else {
			await repo.set(mailboxId, domain, collection, {
				mailboxId,
				domain,
				collection,
				content: content,
			});
		}
	};

	const getCollection = async (
		mailboxId: string,
		domain: string,
		collection: string,
	): Promise<EncodedRecord> => {
		const existing = await repo.get(mailboxId, domain, collection);
		return existing ? existing.content : {};
	};

	return {
		setCollection,
		getCollection,
	};
}
