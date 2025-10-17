import type { Kysely } from "kysely";
import type { Database, NewCollection } from "./index.ts";

export function createCollectionsRepo(db: Kysely<Database>) {
	return {
		insert: (collection: NewCollection) =>
			db
				.insertInto("__collections")
				.values({
					id: collection.id,
					mailbox_id: collection.mailbox_id,
					domain: collection.domain,
					collection: collection.collection,
					content: collection.content,
				})
				.executeTakeFirstOrThrow(),
		update: (
			mailboxId: string,
			domain: string,
			collection: string,
			content: string,
		) =>
			db
				.updateTable("__collections")
				.set({
					content,
					updated_at: Math.floor(Date.now() / 1000),
				})
				.where("mailbox_id", "=", mailboxId)
				.where("domain", "=", domain)
				.where("collection", "=", collection)
				.executeTakeFirstOrThrow(),
	};
}
