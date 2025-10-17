import { type Kysely } from "kysely";
import type { Database, NewChallenge } from "./index.ts";

export function createChallengeRepo(db: Kysely<Database>) {
	return {
		insert: (challenge: NewChallenge) =>
			db
				.insertInto("__challenges")
				.values({
					id: challenge.id,
					mailbox_id: challenge.mailbox_id,
					challenge: challenge.challenge,
				})
				.executeTakeFirstOrThrow(),
	};
}
