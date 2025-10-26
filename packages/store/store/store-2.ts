import {
	create as createBaseStore,
	type StoreLite,
	type StoreLiteHooks,
	type StoreLiteOnBeforeDelete,
	type StoreLiteOnBeforePatch,
	type StoreLiteOnBeforePut,
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
	beforePut: Set<StoreLiteOnBeforePut<T>>;
	beforePatch: Set<StoreLiteOnBeforePatch<T>>;
	beforeDel: Set<StoreLiteOnBeforeDelete>;
	put: Set<StoreLiteOnPut<T>>;
	patch: Set<StoreLiteOnPatch<T>>;
	del: Set<StoreLiteOnDelete>;
};

const create = <T extends Record<string, unknown>>() => {
	const listeners: ListenerMap<T> = {
		beforePut: new Set(),
		beforePatch: new Set(),
		beforeDel: new Set(),
		put: new Set(),
		patch: new Set(),
		del: new Set(),
	};
	const initializers = new Set<PluginHandle<T>["init"]>();
	const disposers = new Set<PluginHandle<T>["dispose"]>();

	const core = createBaseStore<T>({
		hooks: {
			onBeforePut: (key, value) => {
				for (const fn of listeners.beforePut) {
					fn(key, value);
				}
			},
			onBeforePatch: (key, value) => {
				for (const fn of listeners.beforePatch) {
					fn(key, value);
				}
			},
			onBeforeDelete: (key) => {
				for (const fn of listeners.beforeDel) {
					fn(key);
				}
			},
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
			if (hooks.onBeforePut) {
				const callback = hooks.onBeforePut;
				listeners.beforePut.add(callback);
				disposers.add(() => {
					listeners.beforePut.delete(callback);
				});
			}
			if (hooks.onBeforePatch) {
				const callback = hooks.onBeforePatch;
				listeners.beforePatch.add(callback);
				disposers.add(() => {
					listeners.beforePatch.delete(callback);
				});
			}
			if (hooks.onBeforeDelete) {
				const callback = hooks.onBeforeDelete;
				listeners.beforeDel.add(callback);
				disposers.add(() => {
					listeners.beforeDel.delete(callback);
				});
			}
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
