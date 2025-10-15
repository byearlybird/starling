import { makePersisted } from "./persisted";
import { createStore } from "./store";
import { type MakeSynchronizedOptions, makeSynchronized } from "./synchronized";
import type { Driver } from "./types";

export function createRepo<T extends object>(
	collectionKey: string,
	{
		driver,
		sync,
	}: {
		driver: Driver;
		sync: Omit<MakeSynchronizedOptions, "setup">;
	},
) {
	const store = createStore<T>(collectionKey);
	const { init: initPersisted, dispose: disposePersisted } = makePersisted(
		store,
		{ driver },
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
