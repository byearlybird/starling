import { jwtVerify, SignJWT } from "jose";
import type { Storage } from "unstorage";
import { isValidPublicKey } from "../../crypto/crypto";
import { isValidMailboxId } from "../../crypto/mailbox-id";
import { createNonce, verifySignature } from "../../crypto/nonce";
import { createChallengeRepo } from "../repos/challenges-repo";
import { createMailboxRepo } from "../repos/mailboxes-repo";

export interface AuthConfig {
	jwtSecret: string;
	tokenExpirationTime?: string;
}

export function createAuthService(storage: Storage, config: AuthConfig) {
	const challengeRepo = createChallengeRepo(storage);
	const mailboxRepo = createMailboxRepo(storage);
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

	const createChallenge = (mailboxId: string) => {
		const id = crypto.randomUUID();
		challengeRepo.set(id, {
			mailboxId,
			nonce: createNonce(),
			createdAt: Date.now(),
			completedAt: null,
		});
		return id;
	};

	const validateChallenge = async (
		challengeId: string,
		signature: string,
	): Promise<boolean> => {
		const challenge = await challengeRepo.get(challengeId);
		if (!challenge) return false;
		const mailbox = await mailboxRepo.get(challenge.mailboxId);
		if (!mailbox) return false;
		return verifySignature(challenge.nonce, signature, mailbox.publicKey);
	};

	const createMailbox = async (mailboxId: string, publicKey: string) => {
		const [isValidKey, isValueMailbox, existing] = await Promise.all([
			isValidPublicKey(publicKey),
			isValidMailboxId(mailboxId),
			mailboxRepo.get(mailboxId),
		]);

		if (existing || !isValidKey || !isValueMailbox) return null;

		return mailboxRepo.set(mailboxId, {
			publicKey,
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
