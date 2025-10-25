import { expect, test } from "bun:test";
import { decode, encode, isEncoded, merge } from "./val.ts";

test("encode creates an EncodedValue with value and eventstamp", () => {
	const value = { text: "hello" };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(value, eventstamp);

	expect(encoded.__value).toBe(value);
	expect(encoded.__eventstamp).toBe(eventstamp);
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

	expect(result.__value).toBe("newer");
	expect(result.__eventstamp).toBe("2025-10-25T12:00:00.000Z|0001");
});

test("merge returns the value with oldest eventstamp when it's newer", () => {
	const into = encode("newer", "2025-10-25T14:00:00.000Z|0001");
	const from = encode("older", "2025-10-25T12:00:00.000Z|0001");

	const result = merge(into, from);

	expect(result.__value).toBe("newer");
	expect(result.__eventstamp).toBe("2025-10-25T14:00:00.000Z|0001");
});

test("isEncoded returns true for valid EncodedValues", () => {
	const encoded = encode({ data: "test" }, "2025-10-25T12:00:00.000Z|0001");
	expect(isEncoded(encoded)).toBe(true);
});

test("isEncoded returns false for plain objects without required fields", () => {
	expect(isEncoded({ __value: "test" })).toBe(false);
	expect(isEncoded({ __eventstamp: "time" })).toBe(false);
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
	expect(isEncoded({ __value: null, __eventstamp: null })).toBe(true);
});
