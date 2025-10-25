// value, eventstamp, deleted (1 or 0)
type SerializedEncodedValue<T = unknown> = [T, string, number];

class EncodedValue<T = unknown> {
    constructor(
        private readonly value: T,
        private readonly eventstamp: string,
        private deleted: boolean,
    ) {}

    getValue(): T {
        return this.value;
    }

    getEventstamp(): string {
        return this.eventstamp;
    }

    isDeleted(): boolean {
        return this.deleted;
    }

    serialize(): SerializedEncodedValue<T> {
        return [this.value, this.eventstamp, this.deleted ? 1 : 0];
    }

    delete() {
        this.deleted = true;
    }

    static deserialize<T = unknown>(data: SerializedEncodedValue<T | unknown>) {
        return new EncodedValue<T>(data[0] as T, data[1], data[2] === 1);
    }
}

class EncodedObject<T extends object = object> {
    private data: Map<string, EncodedObject | EncodedValue> = new Map();
    private meta: { version: number; deleted: boolean } = {
        version: 1,
        deleted: false,
    };

    constructor() {}

    /**
     * Encode a plain object with the given eventstamp.
     * Recursively encodes nested plain objects.
     */
    static encode<T extends object>(
        obj: T,
        eventstamp: string,
    ): EncodedObject<T> {
        const encoded = new EncodedObject<T>();

        function step(target: Record<string, unknown>, output: EncodedObject) {
            for (const key in target) {
                if (!Object.hasOwn(target, key)) continue;

                const value = target[key];

                // Check if this is a nested plain object
                if (
                    value != null &&
                    typeof value === "object" &&
                    !Array.isArray(value) &&
                    Object.getPrototypeOf(value) === Object.prototype
                ) {
                    // Recurse into nested object
                    const nested = new EncodedObject();
                    step(value as Record<string, unknown>, nested);
                    output.data.set(key, nested);
                } else {
                    // Leaf value - wrap with eventstamp
                    output.data.set(key, new EncodedValue(value, eventstamp, false));
                }
            }
        }

        step(obj as Record<string, unknown>, encoded);
        return encoded;
    }

    /**
     * Decode this encoded object into a plain object.
     */
    decode<TDecoded = T>(): TDecoded {
        const result: Record<string, unknown> = {};

        const step = (source: EncodedObject, output: Record<string, unknown>) => {
            for (const [key, value] of source.data) {
                if (key === "__deleted") continue;

                if (value instanceof EncodedValue) {
                    // Skip deleted values
                    if (!value.isDeleted()) {
                        output[key] = value.getValue();
                    }
                } else if (value instanceof EncodedObject) {
                    // Recurse into nested object
                    output[key] = {};
                    step(value, output[key] as Record<string, unknown>);
                }
            }
        };

        step(this, result);
        return result as TDecoded;
    }

    /**
     * Update this object from a plain object using the given eventstamp.
     * Encodes the plain object and merges it using Last-Write-Wins semantics.
     * Returns whether any changes were made.
     */
    updateFrom(plainObj: Record<string, unknown>, eventstamp: string): boolean {
        const encoded = EncodedObject.encode(plainObj, eventstamp);
        return this.merge(encoded);
    }

    /**
     * Merge another EncodedObject into this one using Last-Write-Wins semantics.
     * Returns whether any changes were made.
     */
    merge(other: EncodedObject): boolean {
        let changed = false;

        // Process keys from both objects
        const allKeys = new Set([...this.data.keys(), ...other.data.keys()]);

        for (const key of allKeys) {
            const v1 = this.data.get(key);
            const v2 = other.data.get(key);

            if (v1 instanceof EncodedValue && v2 instanceof EncodedValue) {
                // Both are values - compare eventstamps (Last-Write-Wins)
                if (v2.getEventstamp() > v1.getEventstamp()) {
                    this.data.set(key, v2);
                    changed = true;
                }
            } else if (v1 instanceof EncodedObject && v2 instanceof EncodedObject) {
                // Both are nested objects - recurse
                if (v1.merge(v2)) {
                    changed = true;
                }
            } else if (v2 && !v1) {
                // Key only in other - add it
                this.data.set(key, v2);
                changed = true;
            } else if (!v1 && !v2) {
                // Both undefined - skip
                continue;
            } else if (v1 instanceof EncodedValue && v2 instanceof EncodedObject) {
                // Type mismatch - prefer nested object
                this.data.set(key, v2);
                changed = true;
            } else if (v1 instanceof EncodedObject && v2 instanceof EncodedValue) {
                // Type mismatch - v1 is object, v2 is value - skip (keep v1)
                continue;
            }
        }

        return changed;
    }

    /**
     * Serialize to a format compatible with the functional API.
     * Includes __meta as [version, deleted].
     */
    serialize(): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        // Add metadata as tuple
        result.__meta = [this.meta.version, this.meta.deleted ? 1 : 0];

        for (const [key, value] of this.data) {
            if (value instanceof EncodedValue) {
                // Store as [value, eventstamp, deleted] tuple
                result[key] = value.serialize();
            } else if (value instanceof EncodedObject) {
                // Recursively serialize nested object
                result[key] = value.serialize();
            }
        }

        return result;
    }

    /**
     * Deserialize from a format compatible with the functional API.
     * Handles __meta as [version, deleted] tuple.
     */
    static deserialize<T extends object = object>(
        data: Record<string, unknown>,
    ): EncodedObject<T> {
        const obj = new EncodedObject<T>();

        const step = (source: Record<string, unknown>, output: EncodedObject) => {
            for (const key in source) {
                if (!Object.hasOwn(source, key)) continue;

                // Handle metadata
                if (key === "__meta") {
                    const meta = source[key];
                    if (Array.isArray(meta) && meta.length === 2) {
                        output.meta.version = meta[0] as number;
                        output.meta.deleted = (meta[1] as number) === 1;
                    }
                    continue;
                }

                const value = source[key];

                // Check if it's an EncodedValue (tuple format)
                if (Array.isArray(value) && value.length === 3) {
                    // Tuple format [value, eventstamp, deleted]
                    output.data.set(key, EncodedValue.deserialize(value as SerializedEncodedValue));
                } else if (
                    value &&
                    typeof value === "object" &&
                    !Array.isArray(value)
                ) {
                    // Could be nested EncodedObject - recurse
                    const nested = new EncodedObject();
                    step(value as Record<string, unknown>, nested);
                    output.data.set(key, nested);
                }
            }
        };

        step(data, obj);
        return obj;
    }

    /**
     * Set a value at the given key with the provided eventstamp.
     */
    set(key: string, value: unknown, eventstamp: string): void {
        this.data.set(key, new EncodedValue(value, eventstamp, false));
    }

    /**
     * Get the decoded value at the given key.
     */
    get(key: string): unknown {
        const value = this.data.get(key);
        if (value instanceof EncodedValue) {
            return value.isDeleted() ? undefined : value.getValue();
        }
        if (value instanceof EncodedObject) {
            return value.decode();
        }
        return undefined;
    }

    /**
     * Mark a key as deleted.
     */
    delete(key: string): void {
        const value = this.data.get(key);
        if (value instanceof EncodedValue) {
            value.delete();
        }
    }

    /**
     * Get all decoded values as key-value pairs.
     */
    values(): [string, unknown][] {
        const result: [string, unknown][] = [];
        for (const [key, value] of this.data) {
            if (key === "__deleted") continue;
            if (value instanceof EncodedValue) {
                if (!value.isDeleted()) {
                    result.push([key, value.getValue()]);
                }
            } else if (value instanceof EncodedObject) {
                result.push([key, value.decode()]);
            }
        }
        return result;
    }

    /**
     * Get all keys.
     */
    keys(): string[] {
        return Array.from(this.data.keys()).filter((k) => k !== "__deleted");
    }

    /**
     * Get all key-value pairs.
     */
    entries(): [string, unknown][] {
        return this.values();
    }

    /**
     * Get the version metadata.
     */
    getVersion(): number {
        return this.meta.version;
    }

    /**
     * Set the version metadata.
     */
    setVersion(version: number): void {
        this.meta.version = version;
    }

    /**
     * Check if object is marked as deleted.
     */
    isMetaDeleted(): boolean {
        return this.meta.deleted;
    }

    /**
     * Mark the object as deleted in metadata.
     */
    setMetaDeleted(deleted: boolean): void {
        this.meta.deleted = deleted;
    }
}

class EncodedMap<T extends object = object> {
    private data: Map<string, EncodedObject<T>> = new Map();

    constructor() {}

    /**
     * Get decoded value at key. Returns undefined if key doesn't exist or is deleted.
     */
    get(key: string): T | undefined {
        const obj = this.data.get(key);
        if (!obj || obj.isMetaDeleted()) {
            return undefined;
        }
        return obj.decode<T>();
    }

    /**
     * Set an encoded object at the given key.
     */
    set(key: string, obj: EncodedObject<T>): void {
        this.data.set(key, obj);
    }

    /**
     * Set from a plain object, encoding it with the given eventstamp.
     * Accepts partial objects for merging.
     * Returns whether any changes were made (new object or updated existing).
     */
    setFrom(key: string, plainObj: Partial<T>, eventstamp: string): boolean {
        const existing = this.data.get(key);
        const encoded = EncodedObject.encode(plainObj, eventstamp);

        if (!existing) {
            // New object
            this.data.set(key, encoded);
            return true;
        }

        // Merge into existing
        return existing.merge(encoded);
    }

    /**
     * Mark object at key as deleted by setting its meta.deleted flag.
     * Returns whether the delete changed anything.
     */
    delete(key: string): boolean {
        const obj = this.data.get(key);
        if (!obj) {
            return false;
        }

        const wasDeleted = obj.isMetaDeleted();
        obj.setMetaDeleted(true);
        return !wasDeleted; // Return true if we changed the deleted state
    }

    /**
     * Merge another EncodedMap into this one using Last-Write-Wins semantics.
     * Returns whether any changes were made.
     */
    merge(other: EncodedMap<T>): boolean {
        let changed = false;

        // Merge objects from other map
        for (const [key, otherObj] of other.data) {
            const existing = this.data.get(key);

            if (!existing) {
                // New key - add it
                this.data.set(key, otherObj);
                changed = true;
            } else {
                // Merge existing object
                if (existing.merge(otherObj)) {
                    changed = true;
                }
            }
        }

        return changed;
    }

    /**
     * Merge a single encoded object at the given key.
     * Returns whether any changes were made.
     */
    mergeObject(key: string, obj: EncodedObject<T>): boolean {
        const existing = this.data.get(key);

        if (!existing) {
            // New object
            this.data.set(key, obj);
            return true;
        }

        // Merge into existing
        return existing.merge(obj);
    }

    /**
     * Get all keys including deleted entries.
     */
    keys(): string[] {
        return Array.from(this.data.keys());
    }

    /**
     * Get decoded non-deleted values as [key, value] pairs.
     */
    values(): [string, T][] {
        const result: [string, T][] = [];
        for (const [key, obj] of this.data) {
            if (!obj.isMetaDeleted()) {
                result.push([key, obj.decode<T>()]);
            }
        }
        return result;
    }

    /**
     * Get decoded non-deleted entries (alias for values).
     */
    entries(): [string, T][] {
        return this.values();
    }

    /**
     * Get total number of keys including deleted entries.
     */
    get size(): number {
        return this.data.size;
    }

    /**
     * Decode to a plain Map<string, T> with non-deleted entries.
     */
    decode(): Map<string, T> {
        const result = new Map<string, T>();
        for (const [key, obj] of this.data) {
            if (!obj.isMetaDeleted()) {
                result.set(key, obj.decode<T>());
            }
        }
        return result;
    }

    /**
     * Serialize to a format for persistence.
     */
    serialize(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, obj] of this.data) {
            result[key] = obj.serialize();
        }
        return result;
    }

    /**
     * Deserialize from a serialized format.
     */
    static deserialize<T extends object = object>(
        data: Record<string, unknown>,
    ): EncodedMap<T> {
        const map = new EncodedMap<T>();

        for (const key in data) {
            if (!Object.hasOwn(data, key)) continue;

            const value = data[key];
            if (value && typeof value === "object") {
                const obj = EncodedObject.deserialize<T>(
                    value as Record<string, unknown>,
                );
                map.data.set(key, obj);
            }
        }

        return map;
    }
}

export { EncodedValue, EncodedObject, EncodedMap };
