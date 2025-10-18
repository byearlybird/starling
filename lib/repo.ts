import type { Storage } from "unstorage";
import { createStore } from "./store";
import { type MakeSynchronizedOptions, makeSynchronized } from "./synchronized";

export function createRepo<T extends object>(
	storage: Storage,
	collectionKey: string,
	sync: Omit<MakeSynchronizedOptions, "setup">,
) {
	const store = createStore<T>(storage, collectionKey);
	const { dispose, refresh } = makeSynchronized(store, sync);

	return { store, dispose, refresh };
}
