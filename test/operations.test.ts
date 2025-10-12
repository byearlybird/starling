import { describe, expect, test } from "bun:test";
import { encode, decode, merge } from "../lib/operations";
import type { EncodedObject } from "../lib/types";

describe("encode", () => {
    test("encodes a simple object", () => {
        const obj = { name: "Alice", age: 30 };
        const timestamp = "2024-01-01T00:00:00Z";
        const eventstampFn = () => timestamp;

        const result = encode(obj, eventstampFn);

        expect(result.name).toEqual({
            __value: "Alice",
            __eventstamp: timestamp,
        });
        expect(result.age).toEqual({
            __value: 30,
            __eventstamp: timestamp,
        });
    });

    test("handles empty objects", () => {
        const obj = {};
        const eventstampFn = () => "2024-01-01T00:00:00Z";

        const result = encode(obj, eventstampFn);

        expect(result).toEqual({});
    });

    test("calls eventstampFn for each property", () => {
        const obj = { a: 1, b: 2, c: 3 };
        let callCount = 0;
        const eventstampFn = () => {
            callCount++;
            return `timestamp-${callCount}`;
        };

        const result = encode(obj, eventstampFn);

        expect(callCount).toBe(3);
        expect(result.a?.__eventstamp).toBe("timestamp-1");
        expect(result.b?.__eventstamp).toBe("timestamp-2");
        expect(result.c?.__eventstamp).toBe("timestamp-3");
    });

    test("preserves different value types", () => {
        const obj = {
            str: "hello",
            num: 42,
            bool: true,
            nil: null,
            arr: [1, 2, 3],
            nested: { key: "value" },
        };
        const eventstampFn = () => "2024-01-01T00:00:00Z";

        const result = encode(obj, eventstampFn);

        expect(result.str?.__value).toBe("hello");
        expect(result.num?.__value).toBe(42);
        expect(result.bool?.__value).toBe(true);
        expect(result.nil?.__value).toBe(null);
        expect(result.arr?.__value).toEqual([1, 2, 3]);
        expect(result.nested?.__value).toEqual({ key: "value" });
    });
});

describe("decode", () => {
    test("materializes a simple encoded object", () => {
        const encoded: EncodedObject = {
            name: {
                __value: "Alice",
                __eventstamp: "2024-01-01T00:00:00Z",
            },
            age: {
                __value: 30,
                __eventstamp: "2024-01-01T00:00:00Z",
            },
        };

        const result = decode<{ name: string; age: number }>(encoded);

        expect(result).toEqual({
            name: "Alice",
            age: 30,
        });
    });

    test("handles empty objects", () => {
        const encoded: EncodedObject = {};

        const result = decode<Record<string, never>>(encoded);

        expect(result).toEqual({});
    });

    test("preserves different value types", () => {
        const encoded: EncodedObject = {
            str: { __value: "hello", __eventstamp: "2024-01-01T00:00:00Z" },
            num: { __value: 42, __eventstamp: "2024-01-01T00:00:00Z" },
            bool: { __value: true, __eventstamp: "2024-01-01T00:00:00Z" },
            nil: { __value: null, __eventstamp: "2024-01-01T00:00:00Z" },
            arr: { __value: [1, 2, 3], __eventstamp: "2024-01-01T00:00:00Z" },
            nested: {
                __value: { key: "value" },
                __eventstamp: "2024-01-01T00:00:00Z",
            },
        };

        const result = decode(encoded);

        expect(result.str).toBe("hello");
        expect(result.num).toBe(42);
        expect(result.bool).toBe(true);
        expect(result.nil).toBe(null);
        expect(result.arr).toEqual([1, 2, 3]);
        expect(result.nested).toEqual({ key: "value" });
    });

    test("round-trip: encode then decode", () => {
        const original = { name: "Bob", age: 25, active: true };
        const eventstampFn = () => "2024-01-01T00:00:00Z";

        const encoded = encode(original, eventstampFn);
        const result = decode<typeof original>(encoded);

        expect(result).toEqual(original);
    });
});

describe("merge", () => {
    test("merges non-overlapping properties", () => {
        const obj1: EncodedObject = {
            name: { __value: "Alice", __eventstamp: "2024-01-01T00:00:00Z" },
        };
        const obj2: EncodedObject = {
            age: { __value: 30, __eventstamp: "2024-01-01T00:00:00Z" },
        };

        const result = merge(obj1, obj2);

        expect(result.name).toEqual({
            __value: "Alice",
            __eventstamp: "2024-01-01T00:00:00Z",
        });
        expect(result.age).toEqual({
            __value: 30,
            __eventstamp: "2024-01-01T00:00:00Z",
        });
    });

    test("keeps newer value when timestamps differ", () => {
        const obj1: EncodedObject = {
            name: { __value: "Alice", __eventstamp: "2024-01-01T00:00:00Z" },
        };
        const obj2: EncodedObject = {
            name: { __value: "Alice Updated", __eventstamp: "2024-01-02T00:00:00Z" },
        };

        const result = merge(obj1, obj2);

        expect(result.name).toEqual({
            __value: "Alice Updated",
            __eventstamp: "2024-01-02T00:00:00Z",
        });
    });

    test("keeps older value when newer timestamp is in obj1", () => {
        const obj1: EncodedObject = {
            name: { __value: "Alice New", __eventstamp: "2024-01-02T00:00:00Z" },
        };
        const obj2: EncodedObject = {
            name: { __value: "Alice Old", __eventstamp: "2024-01-01T00:00:00Z" },
        };

        const result = merge(obj1, obj2);

        expect(result.name).toEqual({
            __value: "Alice New",
            __eventstamp: "2024-01-02T00:00:00Z",
        });
    });

    test("uses >= for timestamp comparison (obj1 wins on tie)", () => {
        const timestamp = "2024-01-01T00:00:00Z";
        const obj1: EncodedObject = {
            name: { __value: "Alice v1", __eventstamp: timestamp },
        };
        const obj2: EncodedObject = {
            name: { __value: "Alice v2", __eventstamp: timestamp },
        };

        const result = merge(obj1, obj2);

        // When timestamps are equal, obj1's value should be kept (>= comparison)
        expect(result.name).toEqual({
            __value: "Alice v1",
            __eventstamp: timestamp,
        });
    });

    test("handles properties only in obj1", () => {
        const obj1: EncodedObject = {
            name: { __value: "Alice", __eventstamp: "2024-01-01T00:00:00Z" },
            age: { __value: 30, __eventstamp: "2024-01-01T00:00:00Z" },
        };
        const obj2: EncodedObject = {};

        const result = merge(obj1, obj2);

        expect(result.name).toEqual({
            __value: "Alice",
            __eventstamp: "2024-01-01T00:00:00Z",
        });
        expect(result.age).toEqual({
            __value: 30,
            __eventstamp: "2024-01-01T00:00:00Z",
        });
    });

    test("handles properties only in obj2", () => {
        const obj1: EncodedObject = {};
        const obj2: EncodedObject = {
            name: { __value: "Bob", __eventstamp: "2024-01-01T00:00:00Z" },
            age: { __value: 25, __eventstamp: "2024-01-01T00:00:00Z" },
        };

        const result = merge(obj1, obj2);

        expect(result.name).toEqual({
            __value: "Bob",
            __eventstamp: "2024-01-01T00:00:00Z",
        });
        expect(result.age).toEqual({
            __value: 25,
            __eventstamp: "2024-01-01T00:00:00Z",
        });
    });

    test("handles empty objects", () => {
        const obj1: EncodedObject = {};
        const obj2: EncodedObject = {};

        const result = merge(obj1, obj2);

        expect(result).toEqual({});
    });

    test("merges complex objects with mixed timestamps", () => {
        const obj1: EncodedObject = {
            name: { __value: "Alice", __eventstamp: "2024-01-01T00:00:00Z" },
            age: { __value: 30, __eventstamp: "2024-01-03T00:00:00Z" },
            city: { __value: "NYC", __eventstamp: "2024-01-02T00:00:00Z" },
        };
        const obj2: EncodedObject = {
            name: { __value: "Alice Updated", __eventstamp: "2024-01-02T00:00:00Z" },
            age: { __value: 31, __eventstamp: "2024-01-01T00:00:00Z" },
            country: { __value: "USA", __eventstamp: "2024-01-01T00:00:00Z" },
        };

        const result = merge(obj1, obj2);

        // name: obj2 newer (01-02 > 01-01)
        expect(result.name?.__value).toBe("Alice Updated");
        // age: obj1 newer (01-03 > 01-01)
        expect(result.age?.__value).toBe(30);
        // city: only in obj1
        expect(result.city?.__value).toBe("NYC");
        // country: only in obj2
        expect(result.country?.__value).toBe("USA");
    });

    test("doesn't modify original objects", () => {
        const obj1: EncodedObject = {
            name: { __value: "Alice", __eventstamp: "2024-01-01T00:00:00Z" },
        };
        const obj2: EncodedObject = {
            age: { __value: 30, __eventstamp: "2024-01-01T00:00:00Z" },
        };

        const obj1Copy = JSON.parse(JSON.stringify(obj1));
        const obj2Copy = JSON.parse(JSON.stringify(obj2));

        merge(obj1, obj2);

        // Original objects should remain unchanged
        expect(obj1).toEqual(obj1Copy);
        expect(obj2).toEqual(obj2Copy);
    });
});
