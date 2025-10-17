import type { Kysely } from "kysely";
import { createMailboxId } from "../../crypto/mailbox-id";
import type { Database } from "../db";
import { createMailboxRepo } from "../db/mailboxes-repo";

export function createMailboxService(db: Kysely<Database>) {
	const repo = createMailboxRepo(db);

	return {
		createMailbox: (publicKey: string) =>
			repo.insert({
				id: createMailboxId(),
				public_key: publicKey,
			}),
	};
}
