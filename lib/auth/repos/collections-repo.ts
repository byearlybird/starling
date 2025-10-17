import type { Storage } from "unstorage";
import type { ServerCollection, ServerCollectionKey } from "./types.ts";

const createKey = (
	mailboxId: string,
	domain: string,
	collectionType: string,
): ServerCollectionKey => `collection:${mailboxId}:${domain}:${collectionType}`;

export function createCollectionsRepo(storage: Storage) {
	return {
		get: (mailboxId: string, domain: string, collection: string) =>
			storage.get<ServerCollection>(createKey(mailboxId, domain, collection)),
		set: (
			mailboxId: string,
			domain: string,
			collection: string,
			value: ServerCollection,
		) =>
			storage.set<ServerCollection>(
				createKey(mailboxId, domain, collection),
				value,
			),
	};
}
