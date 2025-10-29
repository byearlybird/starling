import { expect, test } from "bun:test";
import {
	decodeValue,
	encodeValue,
	isEncodedValue,
	mergeValues,
} from "./value.ts";

test("encode creates an EncodedValue with value and eventstamp", () => {
	const value = { text: "hello" };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeValue(value, eventstamp);

	expect(encoded["~value"]).toBe(value);
	expect(encoded["~eventstamp"]).toBe(eventstamp);
});

test("decode extracts the value from an EncodedValue", () => {
	const original = "test string";
	const encoded = encodeValue(original, "2025-10-25T12:00:00.000Z|0001");
	const decoded = decodeValue(encoded);

	expect(decoded).toBe(original);
});

test("merge returns the value with newer eventstamp", () => {
	const into = encodeValue("older", "2025-10-25T10:00:00.000Z|0001");
	const from = encodeValue("newer", "2025-10-25T12:00:00.000Z|0001");

	const [result, eventstamp] = mergeValues(into, from);

	expect(result["~value"]).toBe("newer");
	expect(result["~eventstamp"]).toBe("2025-10-25T12:00:00.000Z|0001");
	expect(eventstamp).toBe("2025-10-25T12:00:00.000Z|0001");
});

test("merge returns the value with oldest eventstamp when it's newer", () => {
	const into = encodeValue("newer", "2025-10-25T14:00:00.000Z|0001");
	const from = encodeValue("older", "2025-10-25T12:00:00.000Z|0001");

	const [result, eventstamp] = mergeValues(into, from);

	expect(result["~value"]).toBe("newer");
	expect(result["~eventstamp"]).toBe("2025-10-25T14:00:00.000Z|0001");
	expect(eventstamp).toBe("2025-10-25T14:00:00.000Z|0001");
});

test("isEncoded returns true for valid EncodedValues", () => {
	const encoded = encodeValue(
		{ data: "test" },
		"2025-10-25T12:00:00.000Z|0001",
	);
	expect(isEncodedValue(encoded)).toBe(true);
});

test("isEncoded returns false for plain objects without required fields", () => {
	expect(isEncodedValue({ "~value": "test" })).toBe(false);
	expect(isEncodedValue({ "~eventstamp": "time" })).toBe(false);
	expect(isEncodedValue({ value: "test", eventstamp: "time" })).toBe(false);
});

test("isEncoded returns false for null and primitives", () => {
	expect(isEncodedValue(null)).toBe(false);
	expect(isEncodedValue(undefined)).toBe(false);
	expect(isEncodedValue("string")).toBe(false);
	expect(isEncodedValue(123)).toBe(false);
	expect(isEncodedValue(true)).toBe(false);
});

test("isEncoded returns false for arrays and other objects", () => {
	expect(isEncodedValue([])).toBe(false);
	expect(isEncodedValue({})).toBe(false);
	expect(isEncodedValue({ "~value": null, "~eventstamp": null })).toBe(true);
});
