import type { Storage } from "unstorage";
import type { Mailbox, MailboxKey } from "./types.ts";

const createKey = (id: string): MailboxKey => `mailbox:${id}`;

export function createMailboxRepo(storage: Storage) {
	return {
		get: (id: string) => storage.get<Mailbox>(createKey(id)),
		set: (key: string, value: Mailbox) =>
			storage.set<Mailbox>(createKey(key), value),
	};
}
