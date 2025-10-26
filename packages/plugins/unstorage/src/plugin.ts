import type { Document, Store } from "@byearlybird/starling";
import type { Storage } from "unstorage";

type MaybePromise<T> = T | Promise<T>;

type UnstorageOnBeforeSet = (
	docs: ReadonlyArray<Document.EncodedDocument>,
) => MaybePromise<Document.EncodedDocument[]>;

type UnstorageOnAfterGet = (
	docs: ReadonlyArray<Document.EncodedDocument>,
) => MaybePromise<Document.EncodedDocument[]>;

type UnstorageConfig = {
	debounceMs?: number;
	onBeforeSet?: UnstorageOnBeforeSet;
	onAfterGet?: UnstorageOnAfterGet;
};

const toReadonly = (
	docs: Document.EncodedDocument[],
): ReadonlyArray<Document.EncodedDocument> =>
	Object.freeze([...docs]);

const unstoragePlugin = <T extends Record<string, unknown>>(
	key: string,
	storage: Storage<Document.EncodedDocument[]>,
	config: UnstorageConfig = {},
): Store.Plugin<T> => {
	const plugin: Store.Plugin<T> = (store) => {
		const { debounceMs = 0, onBeforeSet, onAfterGet } = config;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const persistSnapshot = async () => {
			const snapshot = store.snapshot();
			const docs =
				onBeforeSet !== undefined
					? await onBeforeSet(toReadonly(snapshot))
					: snapshot;
			await storage.set(key, docs);
		};

		const schedulePersist = () => {
			const runPersist = () => {
				debounceTimer = null;
				void persistSnapshot();
			};

			if (debounceMs === 0) {
				runPersist();
				return;
			}

			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
			}

			debounceTimer = setTimeout(runPersist, debounceMs);
		};

		return {
			init: async () => {
				const persisted = await storage.get<Document.EncodedDocument[]>(key);

				if (!persisted) return;

				const docs =
					onAfterGet !== undefined
						? await onAfterGet(toReadonly(persisted))
						: persisted;

				if (!docs || docs.length === 0) return;

				const tx = store.begin();
				for (const doc of docs) {
					tx.merge(doc);
				}
				tx.commit({ silent: true });
			},
			dispose: () => {
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
					debounceTimer = null;
				}
			},
			hooks: {
				onPut: () => {
					schedulePersist();
				},
				onPatch: () => {
					schedulePersist();
				},
				onDelete: () => {
					schedulePersist();
				},
			},
		};
	};

	return plugin;
};

export { unstoragePlugin };
export type { UnstorageConfig };
