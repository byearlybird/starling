import type { Kysely } from "kysely";
import { generateNonce } from "../../crypto/nonce";
import type { Database } from "../db";
import { createChallengeRepo } from "../db/challenges-repo";

export function createChallengeService(db: Kysely<Database>) {
	const repo = createChallengeRepo(db);

	return {
		createChallenge: (mailboxId: string) =>
			repo.insert({
				id: crypto.randomUUID(),
				mailbox_id: mailboxId,
				nonce: generateNonce(),
			}),
	};
}
