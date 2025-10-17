import type { Kysely } from "kysely";
import { generateNonce, verifySignature } from "../../crypto/nonce";
import type { Database } from "../db";
import { createChallengeRepo } from "../db/challenges-repo";

export function createAuthService(db: Kysely<Database>) {
	const challengeRepo = createChallengeRepo(db);

	return {
		createChallenge: (mailboxId: string) =>
			challengeRepo.insert({
				id: crypto.randomUUID(),
				mailbox_id: mailboxId,
				nonce: generateNonce(),
			}),
		validateChallenge: async (
			challengeId: string,
			signature: string,
		): Promise<boolean> => {
			const challenge = await challengeRepo.getWithPublicKey(challengeId);
			if (!challenge) return false;

			return verifySignature(challenge.nonce, signature, challenge.public_key);
		},
	};
}
