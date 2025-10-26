import {
	create as createBaseStore,
	type StoreLite,
	type StoreLiteHooks,
	type StoreLiteOnDelete,
	type StoreLiteOnPatch,
	type StoreLiteOnPut,
} from "./store-lite";

type PluginHandle<T extends Record<string, unknown>> = {
	init: () => Promise<void> | void;
	dispose: () => Promise<void> | void;
	hooks?: StoreLiteHooks<T>;
};

type Plugin<T extends Record<string, unknown>> = (
	store: StoreLite<T>,
) => PluginHandle<T>;

type ListenerMap<T extends Record<string, unknown>> = {
	put: Set<StoreLiteOnPut<T>>;
	patch: Set<StoreLiteOnPatch<T>>;
	del: Set<StoreLiteOnDelete>;
};

const create = <T extends Record<string, unknown>>() => {
	const listeners: ListenerMap<T> = {
		put: new Set(),
		patch: new Set(),
		del: new Set(),
	};
	const initializers = new Set<PluginHandle<T>["init"]>();
	const disposers = new Set<PluginHandle<T>["dispose"]>();

	const core = createBaseStore<T>({
		hooks: {
			onPut: (data) => {
				for (const fn of listeners.put) {
					fn(data);
				}
			},
			onPatch: (data) => {
				for (const fn of listeners.patch) {
					fn(data);
				}
			},
			onDelete: (data) => {
				for (const fn of listeners.del) {
					fn(data);
				}
			},
		},
	});

	return {
		...core,
		use(plugin: Plugin<T>) {
			const { hooks, init, dispose } = plugin(this);

			if (hooks) {
				if (hooks.onPut) {
					const callback = hooks.onPut;
					listeners.put.add(callback);
					disposers.add(() => {
						listeners.put.delete(callback);
					});
				}
				if (hooks.onPatch) {
					const callback = hooks.onPatch;
					listeners.patch.add(callback);
					disposers.add(() => {
						listeners.patch.delete(callback);
					});
				}
				if (hooks.onDelete) {
					const callback = hooks.onDelete;
					listeners.del.add(callback);
					disposers.add(() => {
						listeners.del.delete(callback);
					});
				}
			}

			initializers.add(init);
			disposers.add(dispose);

			return this;
		},
		async init() {
			for (const fn of initializers) {
				// Await sequentially to honor the order plugins are registered (FIFO)
				await fn();
			}
		},
		async dispose() {
			for (const fn of Array.from(disposers).toReversed()) {
				// Await in reverse order to honor the order plugins are registered (LIFO)
				await fn();
			}
		},
	};
};

export { create };
