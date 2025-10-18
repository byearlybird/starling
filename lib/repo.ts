import type { Storage } from "unstorage";
import { makePersisted } from "./persisted";
import { createStore } from "./store";
import { type MakeSynchronizedOptions, makeSynchronized } from "./synchronized";

export function createRepo<T extends object>(
	collectionKey: string,
	{
		storage,
		sync,
	}: {
		storage: Storage;
		sync: Omit<MakeSynchronizedOptions, "setup">;
	},
) {
	const store = createStore<T>(collectionKey);
	const { init: initPersisted, dispose: disposePersisted } = makePersisted(
		store,
		{ storage },
	);
	const { init: initSynchronized, dispose: disposeSynchronized } =
		makeSynchronized(store, {
			...sync,
			setup: initPersisted,
		});

	const initPromise = (async (): Promise<void> => {
		await Promise.all([initPersisted, initSynchronized]);
	})();

	const dispose = () => {
		disposePersisted();
		disposeSynchronized();
	};

	return { store, initPromise, dispose };
}
