import type { Data, Store } from "./store";

type Driver = {
	get: (key: string) => Promise<string>;
	set: (key: string, values: string) => Promise<void>;
};

export function makePersisted<TValue extends object>(
	store: Store<TValue>,
	{
		key,
		driver,
		serialize = JSON.stringify,
		deserialize = JSON.parse,
		onError = console.error,
	}: {
		key: string;
		driver: Driver;
		serialize?: (data: Data) => string;
		deserialize?: (data: string) => Data;
		onError?: (error: unknown) => void;
	},
) {
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
