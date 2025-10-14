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
	const persist = createPersist({
		store,
		driver,
		key: `__${store.collectionKey}`,
		serialize,
		deserialize,
		onError,
		debounceMs: 100,
	});

	const disposeInsert = store.onInsert(() => {
		persist.trigger();
	});

	const disposeUpdate = store.onUpdate(() => {
		persist.trigger();
	});

	const dispose = () => {
		persist.cancel();
		disposeInsert();
		disposeUpdate();
	};

	return {
		init: persist.init,
		dispose,
	};
}

export function createPersist<TValue extends object>({
	store,
	driver,
	key,
	serialize,
	deserialize,
	onError,
	debounceMs,
}: {
	store: Store<TValue>;
	driver: Driver;
	key: string;
	serialize: (data: Data) => string;
	deserialize: (data: string) => Data;
	onError: (error: unknown) => void;
	debounceMs: number;
}): {
	init: Promise<void>;
	trigger: () => void;
	cancel: () => void;
} {
	let timer: Timer | null = null;

	const init = (async () => {
		try {
			const persisted = await driver.get(key);
			if (persisted) {
				const data = deserialize(persisted);
				store.__unsafe_replace(data);
			}
		} catch (error) {
			onError(error);
		}
	})();

	const persistFn = async () => {
		try {
			await init;
			const values = store.state();
			const serialized = serialize(values);
			await driver.set(key, serialized);
		} catch (error) {
			onError(error);
		}
	};

	return {
		init,
		trigger: () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(async () => {
				await persistFn();
			}, debounceMs);
		},
		cancel: () => {
			if (timer) clearTimeout(timer);
		},
	};
}
