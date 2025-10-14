import type { Data, Store } from "./store";
import type { Driver } from "./types";

export function makePersisted<TValue extends object>(
	store: Store<TValue>,
	{
		driver,
		serialize = JSON.stringify,
		deserialize = JSON.parse,
		onError = console.error,
	}: {
		driver: Driver;
		serialize?: (data: Data) => string;
		deserialize?: (data: string) => Data;
		onError?: (error: unknown) => void;
	},
) {
	const key = `__${store.collectionKey}`;
	const init = (async () => {
		try {
			const persisted = await driver.get(key);
			const data = deserialize(persisted);
			store.__unsafe_replace(data);
		} catch (error) {
			onError?.(error);
		}
	})();

	const persist = async () => {
		try {
			await init;
			const values = store.state();
			const serialized = serialize(values);
			await driver.set(key, serialized);
		} catch (error) {
			onError?.(error);
		}
	};

	const disposeInsert = store.onInsert(async () => {
		await persist();
	});

	const disposeUpdate = store.onUpdate(async () => {
		await persist();
	});

	const dispose = () => {
		disposeInsert();
		disposeUpdate();
	};

	return {
		init,
		dispose,
	};
}
