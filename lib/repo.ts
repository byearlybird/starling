import type { Storage } from "unstorage";
import { createStore } from "./store";
import { type MakeSynchronizedOptions, makeSynchronized } from "./synchronized";

export function createRepo<T extends object>(
	storage: Storage,
	collectionKey: string,
	sync: Omit<MakeSynchronizedOptions, "setup">,
) {
	const store = createStore<T>(storage, collectionKey);
	const { init: initSynchronized, dispose: disposeSynchronized } =
		makeSynchronized(store, {
			...sync,
		});

	const initPromise = (async (): Promise<void> => {
		await Promise.all([initSynchronized]);
	})();

	const dispose = () => {
		disposeSynchronized();
	};

	return { store, initPromise, dispose };
}
