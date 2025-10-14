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
	}: {
		key: string;
		driver: Driver;
		serialize?: (data: Data) => string;
		deserialize?: (data: string) => Data;
	},
) {
	const init = (async () => {
		const persisted = await driver.get(key);
		const data = deserialize(persisted);
		store.__unsafe_replace(data);
	})();

	const persist = async () => {
		const values = store.state();
		const serialized = serialize(values);
		await driver.set(key, serialized);
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
