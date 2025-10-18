import type { EncodedRecord } from "../../core/types";

export type Mailbox = {
	publicKey: string;
};

export type Challenge = {
	mailboxId: string;
	nonce: string;
	createdAt: number;
	completedAt: number | null;
};

export type ServerCollection = {
	mailboxId: string;
	domain: string;
	collection: string;
	content: EncodedRecord;
};

export type MailboxKey = `mailbox:${string}`;
export type ChallengeKey = `challenge:${string}`;
export type ServerCollectionKey = `collection:${string}:${string}:${string}`;
