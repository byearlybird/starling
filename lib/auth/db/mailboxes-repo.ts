import type { Kysely } from "kysely";
import type { Database, NewMailbox } from "./index.ts";

export function createMailboxRepo(db: Kysely<Database>) {
	return {
		insert: (mailbox: NewMailbox) =>
			db
				.insertInto("__mailboxes")
				.values({
					id: mailbox.id,
					public_key: mailbox.public_key,
				})
				.executeTakeFirstOrThrow(),
	};
}
