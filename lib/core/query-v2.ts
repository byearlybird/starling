import mitt from "mitt";
import type { Store } from "./store-v2";

type StoreEvents<TValue> = {
    insert: { key: string; value: TValue }[];
    update: { key: string; value: TValue }[];
    delete: { key: string }[];
};

type QueryEvents<TValue> = {
    change: Record<string, TValue>;
};

export class Query<TValue extends object> {
    #results: Map<string, TValue> = new Map();
    #unwatchers = new Set<() => void>();
    #store: Store<TValue>;
    #predicate: (data: TValue) => boolean;
    #emitter = mitt<QueryEvents<TValue>>();

    constructor(store: Store<TValue>, predicate: (data: TValue) => boolean) {
        this.#store = store;
        this.#predicate = predicate;

        // Run initial query
        Object.entries(store.values()).forEach(([key, value]) => {
            if (this.#predicate(value)) {
                this.#results.set(key, value);
            }
        });

        // Register events
        this.#registerStoreHandler("insert", this.#handleInsertEvent);
        this.#registerStoreHandler("update", this.#handleUpdateEvent);
        this.#registerStoreHandler("delete", this.#handleDeleteEvent);
    }

    #registerStoreHandler<K extends keyof StoreEvents<TValue>>(
        event: K,
        handler: (data: StoreEvents<TValue>[K]) => void,
    ): void {
        const unwatch = this.#store.on(event, handler);
        this.#unwatchers.add(unwatch);
    }

    #handleInsertEvent = (data: StoreEvents<TValue>["insert"]) => {
        this.#handleStoreChange(() => {
            let changed = false;
            data.forEach((item) => {
                if (this.#predicate(item.value)) {
                    this.#results.set(item.key, item.value);
                    changed = true;
                }
            });
            return changed;
        });
    };

    #handleUpdateEvent = (data: StoreEvents<TValue>["update"]) => {
        this.#handleStoreChange(() => {
            let changed = false;
            data.forEach((item) => {
                if (this.#predicate(item.value)) {
                    this.#results.set(item.key, item.value);
                    changed = true;
                } else if (this.#results.has(item.key)) {
                    this.#results.delete(item.key);
                    changed = true;
                }
            });
            return changed;
        });
    };

    #handleDeleteEvent = (data: StoreEvents<TValue>["delete"]) => {
        this.#handleStoreChange(() => {
            let changed = false;
            data.forEach((item) => {
                if (this.#results.has(item.key)) {
                    changed = true;
                    this.#results.delete(item.key);
                }
            });
            return changed;
        });
    };

    #handleStoreChange(callback: () => boolean): void {
        if (callback()) {
            this.#emitter.emit("change", this.results());
        }
    }

    results(): Record<string, TValue> {
        return Object.fromEntries(this.#results);
    }

    on<K extends keyof QueryEvents<TValue>>(
        event: K,
        callback: (data: QueryEvents<TValue>[K]) => void,
    ) {
        this.#emitter.on(event, callback);

        return () => {
            this.#emitter.off(event, callback);
        };
    }


    dispose() {
        this.#emitter.off('change');
        for (const unwatch of this.#unwatchers) {
            unwatch();
        }
    }
}
