import { expect, test } from "bun:test";
import { decode, encode, isEncoded, merge } from "./value.ts";

test("encode creates an EncodedValue with value and eventstamp", () => {
	const value = { text: "hello" };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(value, eventstamp);

	expect(encoded["~value"]).toBe(value);
	expect(encoded["~eventstamp"]).toBe(eventstamp);
});

test("decode extracts the value from an EncodedValue", () => {
	const original = "test string";
	const encoded = encode(original, "2025-10-25T12:00:00.000Z|0001");
	const decoded = decode(encoded);

	expect(decoded).toBe(original);
});

test("merge returns the value with newer eventstamp", () => {
	const into = encode("older", "2025-10-25T10:00:00.000Z|0001");
	const from = encode("newer", "2025-10-25T12:00:00.000Z|0001");

	const result = merge(into, from);

	expect(result["~value"]).toBe("newer");
	expect(result["~eventstamp"]).toBe("2025-10-25T12:00:00.000Z|0001");
});

test("merge returns the value with oldest eventstamp when it's newer", () => {
	const into = encode("newer", "2025-10-25T14:00:00.000Z|0001");
	const from = encode("older", "2025-10-25T12:00:00.000Z|0001");

	const result = merge(into, from);

	expect(result["~value"]).toBe("newer");
	expect(result["~eventstamp"]).toBe("2025-10-25T14:00:00.000Z|0001");
});

test("isEncoded returns true for valid EncodedValues", () => {
	const encoded = encode({ data: "test" }, "2025-10-25T12:00:00.000Z|0001");
	expect(isEncoded(encoded)).toBe(true);
});

test("isEncoded returns false for plain objects without required fields", () => {
	expect(isEncoded({ "~value": "test" })).toBe(false);
	expect(isEncoded({ "~eventstamp": "time" })).toBe(false);
	expect(isEncoded({ value: "test", eventstamp: "time" })).toBe(false);
});

test("isEncoded returns false for null and primitives", () => {
	expect(isEncoded(null)).toBe(false);
	expect(isEncoded(undefined)).toBe(false);
	expect(isEncoded("string")).toBe(false);
	expect(isEncoded(123)).toBe(false);
	expect(isEncoded(true)).toBe(false);
});

test("isEncoded returns false for arrays and other objects", () => {
	expect(isEncoded([])).toBe(false);
	expect(isEncoded({})).toBe(false);
	expect(isEncoded({ "~value": null, "~eventstamp": null })).toBe(true);
});
