import type { Store } from "./store";
import type { Driver } from "./types";

export function makePersisted<TValue extends object>(
	store: Store<TValue>,
	{
		driver,
		onError = console.error,
	}: {
		driver: Driver;
		onError?: (error: unknown) => void;
	},
) {
	const persist = createPersist({
		store,
		driver,
		key: `__${store.collectionKey}`,
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
	onError,
	debounceMs,
}: {
	store: Store<TValue>;
	driver: Driver;
	key: string;
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
				store.__unsafe_replace(persisted);
			}
		} catch (error) {
			onError(error);
		}
	})();

	const persistFn = async () => {
		try {
			await init;
			const values = store.state();
			await driver.set(key, values);
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
