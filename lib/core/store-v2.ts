import mitt from "mitt";
import { prefixStorage, type Storage } from "unstorage";
import { decode, encode, merge } from "./operations";
import type { EncodedObject, EncodedRecord } from "./types";

type DeepPartial<T> = T extends object
    ? {
        [P in keyof T]?: DeepPartial<T[P]>;
    }
    : T;

type Events<TValue> = {
    insert: { key: string; value: TValue }[];
    update: { key: string; value: TValue }[];
    delete: { key: string }
    mutate: undefined;
};

export class Store<TValue extends object> {
    #encode: (data: TValue | DeepPartial<TValue>) => EncodedObject;
    #collectionKey: string;
    #storage: Storage;
    #cache = new Map<string, EncodedObject>();
    #emitter = mitt<Events<TValue>>();

    constructor(
        key: string,
        { storage, eventstampFn }: { storage: Storage; eventstampFn: () => string },
    ) {
        this.#collectionKey = key;
        this.#storage = prefixStorage(storage, key);
        this.#encode = (data: TValue | DeepPartial<TValue>) => encode(data, eventstampFn());
    }

    get collectionKey() {
        return this.#collectionKey;
    }

    async #mutate(key: string, value: EncodedObject) {
        await this.#storage.set(key, value);
        this.#cache.set(key, value);
        this.#emitter.emit("mutate");
    }

    async init() {
        const keys = await this.#storage.getKeys();
        const items = await this.#storage.getItems<EncodedObject>(keys);

        items
            .filter((item) => !item.value.__deleted)
            .forEach((item) => {
                this.#cache.set(item.key, item.value);
            });
    }

    async insert(key: string, value: TValue) {
        if (this.#cache.has(key)) {
            throw new Error(`[${this.#collectionKey}]: Duplicate key: ${key}`);
        }

        const encoded = this.#encode(value);
        await this.#mutate(key, encoded)
            .then(() => {
                this.#emitter.emit('insert', [{ key, value }]);
            });
    }

    async update(key: string, value: DeepPartial<TValue>) {
        const current = this.#cache.get(key);
        if (!current) throw new Error(`[${this.#collectionKey}]: Key not found: ${key}`);

        const encoded = this.#encode(value);
        const [merged, changed] = merge(current, encoded);

        if (!changed) return;

        await this.#mutate(key, merged).then(() => {
            this.#emitter.emit('update', [{ key, value: decode(merged) }]);
        });
    }

    async delete(key: string) {
        const current = this.#cache.get(key);
        if (!current) throw new Error(`[${this.#collectionKey}]: Key not found: ${key}`);

        const [merged, changed] = merge(current, this.#encode({ __deleted: true } as TValue));

        if (!changed) return;

        await this.#mutate(key, merged).then(() => {
            this.#emitter.emit('delete', { key });
        })
    }

    values(): Record<string, TValue> {
        return Object.fromEntries(
            Object.entries(this.#cache).map(([key, value]) => [key, decode(value)]),
        );
    }

    snapshot(): EncodedRecord {
        return Object.fromEntries(this.#cache);
    }

    on<K extends keyof Events<TValue>>(event: K, callback: (data: Events<TValue>[K]) => void) {
        this.#emitter.on(event, callback);

        return () => {
            this.#emitter.off(event, callback);
        }
    }

    dispose() {
        this.#emitter.off("insert");
        this.#emitter.off("update");
        this.#emitter.off("delete");
        this.#emitter.off("mutate");
    }
}
