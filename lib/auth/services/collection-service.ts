import type { Kysely } from "kysely";
import type { Database } from "../db";
import { createCollectionsRepo } from "../db/collections-repo";

export function createCollectionService(db: Kysely<Database>) {
	const repo = createCollectionsRepo(db);

	return {
		createCollection: (
			mailboxId: string,
			domain: string,
			collection: string,
			content: string,
		) =>
			repo.insert({
				id: crypto.randomUUID(),
				mailbox_id: mailboxId,
				domain,
				collection,
				content,
			}),
		updateCollection: (
			mailboxId: string,
			domain: string,
			collection: string,
			content: string,
		) => repo.update(mailboxId, domain, collection, content),
	};
}
