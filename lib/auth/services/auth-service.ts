import { jwtVerify, SignJWT } from "jose";
import type { Kysely } from "kysely";
import { createNonce, verifySignature } from "../../crypto/nonce";
import type { Database } from "../db";
import { createChallengeRepo } from "../db/challenges-repo";

export function createAuthService(db: Kysely<Database>) {
	const challengeRepo = createChallengeRepo(db);
	const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

	const createToken = (mailboxId: string) =>
		new SignJWT({ mailboxId })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("15m")
			.sign(JWT_SECRET);

	const validateToken = async (token: string) => {
		try {
			const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
			const { payload } = await jwtVerify(token, JWT_SECRET);
			return payload as { mailboxId: string };
		} catch (error) {
			console.error("Token verification failed:", error);
			return null;
		}
	};

	return {
		createChallenge: (mailboxId: string) =>
			challengeRepo.insert({
				id: crypto.randomUUID(),
				mailbox_id: mailboxId,
				nonce: createNonce(),
			}),
		validateChallenge: async (
			challengeId: string,
			signature: string,
		): Promise<boolean> => {
			const challenge = await challengeRepo.getWithPublicKey(challengeId);
			return challenge
				? verifySignature(challenge.nonce, signature, challenge.public_key)
				: false;
		},
		createToken,
		validateToken,
	};
}
