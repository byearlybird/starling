import mitt from "mitt";
import { prefixStorage, type Storage } from "unstorage";
import { KeyNotFoundError } from "./errors";
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
            const peristPromises = data.map(async (item) => {
                await this.#storage.set(item.key, item.value);
                this.#cache.set(item.key, item.value);
                mutatedKeys.add(item.key);
            });

            await Promise.all(peristPromises);
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
        await this.#mutate(key, encoded).then(() => {
            this.#emitter.emit("insert", [{ key, value }]);
        });
    }

    async insertAll(data: { key: string; value: TValue }[]) {
        const duplicateKeys = data.filter(({ key }) => this.#cache.has(key));

        if (duplicateKeys) {
            const conflictingKeysString = duplicateKeys.map((k) => k.key).join(", ");
            throw new Error(
                `[${this.#collectionKey}]: Duplicate key(s): ${conflictingKeysString}`,
            );
        }

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
        const [success, missing] = validateAllKeysExist(this.#cache, data.map((d) => d.key));
        if (!success) {
            throw new KeyNotFoundError(missing);
        }


        const toMerge: { key: string; value: EncodedObject }[] = [];
        data.forEach((d) => {
            const current = this.#cache.get(d.key);
            const encoded = this.#encode(d.value);
            // biome-ignore lint/style/noNonNullAssertion: <gaurded against above>
            const [mergedValue, changed] = merge(current!, encoded);
            if (changed) toMerge.push({ key: d.key, value: mergedValue });
        });

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
        const [success, missing] = validateAllKeysExist(this.#cache, keys);
        if (!success) {
            throw new KeyNotFoundError(missing);
        }

        const toMerge: { key: string; value: EncodedObject }[] = [];
        keys.forEach((key) => {
            const current = this.#cache.get(key);
            const [mergedValue, changed] = merge(
                // biome-ignore lint/style/noNonNullAssertion: <guarded against above>
                current!,
                this.#encode({ __deleted: true } as TValue),
            );
            if (changed) toMerge.push({ key, value: mergedValue });
        });

        if (toMerge.length === 0) return;

        const { mutatedKeys } = await this.#mutateAll(toMerge);

        const deletedKeys = toMerge
            .filter((item) => mutatedKeys.has(item.key))
            .map((item) => ({ key: item.key }));

        this.#emitter.emit("delete", deletedKeys);
    }

    values(): Record<string, TValue> {
        return Object.fromEntries(
            Object.entries(this.#cache).map(([key, value]) => [key, decode(value)]),
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

function validateAllKeysExist(
    map: Map<string, unknown>,
    keys: string[],
): [boolean, string[]] {
    const missingKeys = keys.filter((key) => !map.has(key));
    return [missingKeys.length === 0, missingKeys];
}
