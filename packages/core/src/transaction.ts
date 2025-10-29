import type { EncodedDocument } from "./document";
import { decodeDoc, encodeDoc } from "./document";

type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

type StorePutOptions = { withId?: string };

type StoreSetTransaction<T> = {
	add: (value: T, options?: StorePutOptions) => string;
	update: (key: string, value: DeepPartial<T>) => void;
	merge: (doc: EncodedDocument) => void;
	del: (key: string) => void;
	get: (key: string) => T | null;
	rollback: () => void;
};

interface TransactionState {
	rolledBack: boolean;
}

/**
 * Factory for creating a transaction object with all mutation methods.
 * Closes over arrays for tracking puts, patches, and deletes.
 */
export const createTransaction = <T>(
	kvTx: {
		set: (
			key: string,
			doc: EncodedDocument,
			opts?: { replace: boolean },
		) => void;
		get: (key: string) => EncodedDocument | null;
		del: (key: string, stamp: string) => void;
		rollback: () => void;
	},
	clock: { now: () => string },
	getId: () => string,
	encodeValue: (key: string, value: T) => EncodedDocument,
	decodeActive: (doc: EncodedDocument | null) => T | null,
	putKeyValues: Array<readonly [string, T]>,
	patchKeyValues: Array<readonly [string, T]>,
	deleteKeys: Array<string>,
): StoreSetTransaction<T> & TransactionState => {
	const state: TransactionState = { rolledBack: false };

	const tx: StoreSetTransaction<T> & TransactionState = {
		rolledBack: false,
		add(value: T, options?: StorePutOptions) {
			const key = options?.withId ?? getId();
			kvTx.set(key, encodeValue(key, value), { replace: true });
			putKeyValues.push([key, value] as const);
			return key;
		},
		update(key: string, value: DeepPartial<T>) {
			kvTx.set(key, encodeDoc(key, value as T, clock.now()));
			const merged = decodeActive(kvTx.get(key));
			if (merged) {
				patchKeyValues.push([key, merged] as const);
			}
		},
		merge(doc: EncodedDocument) {
			if (kvTx.get(doc["~id"])) {
				kvTx.set(doc["~id"], doc);
			} else {
				kvTx.set(doc["~id"], doc, { replace: true });
			}

			const currentDoc = kvTx.get(doc["~id"]);
			if (currentDoc && !currentDoc["~deletedAt"]) {
				const merged = decodeDoc<T>(currentDoc)["~data"];
				patchKeyValues.push([doc["~id"], merged] as const);
			}
		},
		del(key: string) {
			const currentDoc = kvTx.get(key);
			if (!currentDoc) return;

			kvTx.del(key, clock.now());
			deleteKeys.push(key);
		},
		get(key: string) {
			return decodeActive(kvTx.get(key));
		},
		rollback() {
			state.rolledBack = true;
			tx.rolledBack = true;
			kvTx.rollback();
		},
	};

	return tx;
};

export type { StoreSetTransaction, StorePutOptions, DeepPartial };
