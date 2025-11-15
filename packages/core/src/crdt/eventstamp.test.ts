import { describe, expect, test } from "bun:test";
import {
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
	isValidEventstamp,
	MIN_EVENTSTAMP,
} from ".";

test("decode() extracts timestamp and counter correctly", () => {
	const nonce = generateNonce();
	const eventstamp = encodeEventstamp(1234567890123, 42, nonce);
	const { timestampMs, counter } = decodeEventstamp(eventstamp);

	expect(timestampMs).toBe(1234567890123);
	expect(counter).toBe(42);
});

test("encode() decode() handles large counters", () => {
	const nonce = generateNonce();
	const eventstamp = encodeEventstamp(Date.now(), 0xffffffff, nonce);
	const { timestampMs, counter } = decodeEventstamp(eventstamp);

	expect(counter).toBe(0xffffffff);
	expect(typeof timestampMs).toBe("number");
	expect(timestampMs).toBeGreaterThan(0);
});

test("encode() and decode() are inverses", () => {
	const originalTimestampMs = Date.now();
	const originalCounter = 12345;
	const originalNonce = generateNonce();

	const eventstamp = encodeEventstamp(
		originalTimestampMs,
		originalCounter,
		originalNonce,
	);
	const { timestampMs, counter, nonce } = decodeEventstamp(eventstamp);

	expect(timestampMs).toBe(originalTimestampMs);
	expect(counter).toBe(originalCounter);
	expect(nonce).toBe(originalNonce);
});

describe("isValidEventstamp()", () => {
	test("accepts valid formats", () => {
		const nonce = generateNonce();
		const generated = encodeEventstamp(Date.now(), 42, nonce);

		expect(isValidEventstamp(generated)).toBe(true);
		expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a1b2")).toBe(true);
		expect(isValidEventstamp("2025-01-01T00:00:00.000Z|ffffffff|a1b2")).toBe(
			true,
		);
		expect(isValidEventstamp(MIN_EVENTSTAMP)).toBe(true);
		expect(isValidEventstamp("2025-12-31T23:59:59.999Z|0001|abcd")).toBe(true);
		expect(isValidEventstamp("2020-01-01T00:00:00.000Z|0000|0000")).toBe(true);
		expect(isValidEventstamp("2025-06-15T12:30:45.123Z|00ff|1234")).toBe(true);
	});

	test.each([
		["2025-01-01T00:00:00.000Z|0001", "missing nonce"],
		["2025-01-01T00:00:00.000Z|a1b2", "missing counter"],
		["", "empty string"],
		["2025-01-01T00:00:00.000Z|0001|a1b2|extra", "extra parts"],
	])("rejects %s (%s)", (eventstamp) => {
		expect(isValidEventstamp(eventstamp)).toBe(false);
	});

	test.each([
		["2025-01-01|0001|a1b2", "no time"],
		["2025/01/01T00:00:00.000Z|0001|a1b2", "wrong date separator"],
		["2025-1-1T00:00:00.000Z|0001|a1b2", "unpadded date"],
		["2025-01-01T00:00:00Z|0001|a1b2", "missing milliseconds"],
	])("rejects %s (invalid ISO format: %s)", (eventstamp) => {
		expect(isValidEventstamp(eventstamp)).toBe(false);
	});

	test.each([
		["2025-01-01T00:00:00.000Z:0001:a1b2", "colons"],
		["2025-01-01T00:00:00.000Z-0001-a1b2", "dashes"],
		["2025-01-01T00:00:00.000Z 0001 a1b2", "spaces"],
	])("rejects %s (wrong delimiter: %s)", (eventstamp) => {
		expect(isValidEventstamp(eventstamp)).toBe(false);
	});

	test.each([
		["2025-01-01T00:00:00.000Z|ABCD|a1b2", "uppercase counter"],
		["2025-01-01T00:00:00.000Z|00FF|a1b2", "uppercase counter"],
		["2025-01-01T00:00:00.000Z|0001|ABCD", "uppercase nonce"],
		["2025-01-01T00:00:00.000Z|0001|A1B2", "uppercase nonce"],
	])("rejects %s (%s)", (eventstamp) => {
		expect(isValidEventstamp(eventstamp)).toBe(false);
	});

	test.each([
		["2025-01-01T00:00:00.000Z|001|a1b2", "counter too short (3)"],
		["2025-01-01T00:00:00.000Z|01|a1b2", "counter too short (2)"],
		["2025-01-01T00:00:00.000Z|1|a1b2", "counter too short (1)"],
		["2025-01-01T00:00:00.000Z|0001|a1b", "nonce too short (3)"],
		["2025-01-01T00:00:00.000Z|0001|ab", "nonce too short (2)"],
		["2025-01-01T00:00:00.000Z|0001|a", "nonce too short (1)"],
		["2025-01-01T00:00:00.000Z|0001|a1b2c", "nonce too long (5)"],
		["2025-01-01T00:00:00.000Z|0001|a1b2c3", "nonce too long (6)"],
	])("rejects %s (%s)", (eventstamp) => {
		expect(isValidEventstamp(eventstamp)).toBe(false);
	});

	test.each([
		["2025-01-01T00:00:00.000Z|00g1|a1b2", "non-hex counter"],
		["2025-01-01T00:00:00.000Z|xyz1|a1b2", "non-hex counter"],
		["2025-01-01T00:00:00.000Z|0001|xyz1", "non-hex nonce"],
		["2025-01-01T00:00:00.000Z|0001|g1b2", "non-hex nonce"],
	])("rejects %s (%s)", (eventstamp) => {
		expect(isValidEventstamp(eventstamp)).toBe(false);
	});
});
