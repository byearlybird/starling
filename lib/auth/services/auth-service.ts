import { jwtVerify, SignJWT } from "jose";
import type { Kysely } from "kysely";
import { isValidPublicKey } from "../../crypto/crypto";
import { isValidMailboxId } from "../../crypto/mailbox-id";
import { createNonce, verifySignature } from "../../crypto/nonce";
import type { Database } from "../db";
import { createChallengeRepo } from "../db/challenges-repo";
import { createMailboxRepo } from "../db/mailboxes-repo";

export interface AuthConfig {
	jwtSecret: string;
	tokenExpirationTime?: string;
}

export function createAuthService(db: Kysely<Database>, config: AuthConfig) {
	const challengeRepo = createChallengeRepo(db);
	const mailboxRepo = createMailboxRepo(db);
	const JWT_SECRET = new TextEncoder().encode(config.jwtSecret);
	const expirationTime = config.tokenExpirationTime ?? "15m";

	const createToken = (mailboxId: string) =>
		new SignJWT({ mailboxId })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(expirationTime)
			.sign(JWT_SECRET);

	const validateToken = async (token: string) => {
		try {
			const { payload } = await jwtVerify(token, JWT_SECRET);
			return payload as { mailboxId: string };
		} catch (error) {
			console.error("Token verification failed:", error);
			return null;
		}
	};

	const createChallenge = (mailboxId: string) =>
		challengeRepo.insert({
			id: crypto.randomUUID(),
			mailbox_id: mailboxId,
			nonce: createNonce(),
		});

	const validateChallenge = async (
		challengeId: string,
		signature: string,
	): Promise<boolean> => {
		const challenge = await challengeRepo.getWithPublicKey(challengeId);
		return challenge
			? verifySignature(challenge.nonce, signature, challenge.public_key)
			: false;
	};

	const createMailbox = async (mailboxId: string, publicKey: string) => {
		const [isValidKey, existing] = await Promise.all([
			isValidPublicKey(publicKey),
			isValidMailboxId(mailboxId),
			mailboxRepo.get(mailboxId),
		]);
		if (existing || !isValidKey || !isValidMailboxId) return null;
		return mailboxRepo.insert({
			id: mailboxId,
			public_key: publicKey,
		});
	};

	return {
		createMailbox,
		createChallenge,
		validateChallenge,
		createToken,
		validateToken,
	};
}
