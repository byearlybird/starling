import mitt from "mitt";
import { prefixStorage, type Storage } from "unstorage";
import { DuplicateKeyError, KeyNotFoundError } from "./errors";
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
    delete: { key: string }[];
    mutate: { key: string }[];
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
        this.#encode = (data: TValue | DeepPartial<TValue>) =>
            encode(data, eventstampFn());
    }

    get collectionKey() {
        return this.#collectionKey;
    }

    async #mutate(key: string, value: EncodedObject) {
        await this.#storage.set(key, value);
        this.#cache.set(key, value);
        this.#emitter.emit("mutate", [{ key }]);
    }

    async #mutateAll(
        data: { key: string; value: EncodedObject }[],
    ): Promise<{ success: boolean; mutatedKeys: Set<string> }> {
        const mutatedKeys = new Set<string>();

        try {
            const persistPromises = data.map(async (item) => {
                await this.#storage.set(item.key, item.value);
                this.#cache.set(item.key, item.value);
                mutatedKeys.add(item.key);
            });

            await Promise.all(persistPromises);
            return { success: true, mutatedKeys };
        } catch (err: unknown) {
            // todo enhance error handling / result types
            console.error(err);
            return { success: false, mutatedKeys };
        } finally {
            if (mutatedKeys.size > 0) {
                this.#emitter.emit(
                    "mutate",
                    Array.from(mutatedKeys).map((key) => ({ key })),
                );
            }
        }
    }

    #assertKeysExist(keys: string[]): void {
        const missing = keys.filter((key) => !this.#cache.has(key));
        if (missing.length > 0) {
            throw new KeyNotFoundError(missing);
        }
    }

    #assertKeysNotExist(keys: string[]): void {
        const duplicates = keys.filter((key) => this.#cache.has(key));
        if (duplicates.length > 0) {
            throw new DuplicateKeyError(duplicates);
        }
    }

    #collectMergedItems(
        keys: string[],
        getEncodedValue: (key: string) => EncodedObject,
    ): { key: string; value: EncodedObject }[] {
        const toMerge: { key: string; value: EncodedObject }[] = [];

        for (const key of keys) {
            const current = this.#cache.get(key);
            // biome-ignore lint/style/noNonNullAssertion: <guarded against by caller>
            const [mergedValue, changed] = merge(current!, getEncodedValue(key));
            if (changed) {
                toMerge.push({ key, value: mergedValue });
            }
        }

        return toMerge;
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
            throw new DuplicateKeyError(key);
        }

        const encoded = this.#encode(value);
        await this.#mutate(key, encoded).then(() => {
            this.#emitter.emit("insert", [{ key, value }]);
        });
    }

    async insertAll(data: { key: string; value: TValue }[]) {
        this.#assertKeysNotExist(data.map((d) => d.key));

        const encoded = data.map((d) => ({
            key: d.key,
            value: this.#encode(d.value),
        }));
        const { mutatedKeys } = await this.#mutateAll(encoded);
        const mutatedData = data.filter((d) => mutatedKeys.has(d.key));

        this.#emitter.emit("insert", mutatedData);
    }

    async update(key: string, value: DeepPartial<TValue>) {
        const current = this.#cache.get(key);
        if (!current) throw new KeyNotFoundError(key);

        const encoded = this.#encode(value);
        const [merged, changed] = merge(current, encoded);

        if (!changed) return;

        await this.#mutate(key, merged).then(() => {
            this.#emitter.emit("update", [{ key, value: decode(merged) }]);
        });
    }

    async updateAll(data: { key: string; value: DeepPartial<TValue> }[]) {
        this.#assertKeysExist(data.map((d) => d.key));

        const dataByKey = new Map(data.map((d) => [d.key, d.value]));
        const toMerge = this.#collectMergedItems(
            data.map((d) => d.key),
            (key) => {
                const value = dataByKey.get(key);
                // biome-ignore lint/style/noNonNullAssertion: <key guaranteed to exist in map>
                return this.#encode(value!);
            },
        );

        if (toMerge.length === 0) return;

        const { mutatedKeys } = await this.#mutateAll(toMerge);

        const updatedData = toMerge
            .filter((item) => mutatedKeys.has(item.key))
            .map((item) => ({
                key: item.key,
                value: decode(item.value) as TValue,
            }));

        this.#emitter.emit("update", updatedData);
    }

    async delete(key: string) {
        const current = this.#cache.get(key);

        if (!current) throw new KeyNotFoundError(key);

        const [merged, changed] = merge(
            current,
            this.#encode({ __deleted: true } as TValue),
        );

        if (!changed) return;

        await this.#mutate(key, merged).then(() => {
            this.#emitter.emit("delete", [{ key }]);
        });
    }

    async deleteAll(keys: string[]) {
        this.#assertKeysExist(keys);

        const deletionMarker = this.#encode({ __deleted: true } as TValue);
        const toMerge = this.#collectMergedItems(keys, () => deletionMarker);

        if (toMerge.length === 0) return;

        const { mutatedKeys } = await this.#mutateAll(toMerge);

        const deletedKeys = toMerge
            .filter((item) => mutatedKeys.has(item.key))
            .map((item) => ({ key: item.key }));

        this.#emitter.emit("delete", deletedKeys);
    }

    values(): Record<string, TValue> {
        return Object.fromEntries(
            Array.from(this.#cache.entries())
                .filter(([_, value]) => !value.__deleted)
                .map(([key, value]) => [key, decode(value)]),
        );
    }

    snapshot(): EncodedRecord {
        return Object.fromEntries(this.#cache);
    }

    on<K extends keyof Events<TValue>>(
        event: K,
        callback: (data: Events<TValue>[K]) => void,
    ) {
        this.#emitter.on(event, callback);

        return () => {
            this.#emitter.off(event, callback);
        };
    }

    dispose() {
        this.#emitter.off("insert");
        this.#emitter.off("update");
        this.#emitter.off("delete");
        this.#emitter.off("mutate");
    }
}
