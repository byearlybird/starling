import { type Kysely } from "kysely";
import type { Database, NewChallenge } from "./index.ts";

export function createChallengeRepo(db: Kysely<Database>) {
	return {
		getWithPublicKey: (challengeId: string) =>
			db
				.selectFrom("__challenges")
				.where("id", "=", challengeId)
				.innerJoin("__mailboxes", "__mailboxes.id", "__challenges.mailbox_id")
				.select([
					"__challenges.id",
					"__challenges.mailbox_id",
					"__challenges.nonce",
					"__challenges.created_at",
					"__mailboxes.public_key",
				])
				.executeTakeFirst(),
		insert: (challenge: NewChallenge) =>
			db
				.insertInto("__challenges")
				.values({
					id: challenge.id,
					mailbox_id: challenge.mailbox_id,
					nonce: challenge.nonce,
				})
				.executeTakeFirstOrThrow(),
	};
}
