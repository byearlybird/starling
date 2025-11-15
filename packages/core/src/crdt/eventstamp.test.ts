import { expect, test } from "bun:test";
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

// ============================================================================
// isValidEventstamp() tests
// ============================================================================

test("isValidEventstamp() returns true for standard format", () => {
	const nonce = generateNonce();
	const eventstamp = encodeEventstamp(Date.now(), 42, nonce);
	expect(isValidEventstamp(eventstamp)).toBe(true);
});

test("isValidEventstamp() returns true for 4-char counter", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a1b2")).toBe(true);
});

test("isValidEventstamp() returns true for large counter (8 hex chars)", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|ffffffff|a1b2")).toBe(
		true,
	);
});

test("isValidEventstamp() returns true for MIN_EVENTSTAMP", () => {
	expect(isValidEventstamp(MIN_EVENTSTAMP)).toBe(true);
});

test("isValidEventstamp() returns true for various valid timestamps", () => {
	expect(isValidEventstamp("2025-12-31T23:59:59.999Z|0001|abcd")).toBe(true);
	expect(isValidEventstamp("2020-01-01T00:00:00.000Z|0000|0000")).toBe(true);
	expect(isValidEventstamp("2025-06-15T12:30:45.123Z|00ff|1234")).toBe(true);
});

test("isValidEventstamp() returns false for missing nonce", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001")).toBe(false);
});

test("isValidEventstamp() returns false for missing counter", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|a1b2")).toBe(false);
});

test("isValidEventstamp() returns false for invalid ISO timestamp format", () => {
	expect(isValidEventstamp("2025-01-01|0001|a1b2")).toBe(false);
	expect(isValidEventstamp("2025/01/01T00:00:00.000Z|0001|a1b2")).toBe(false);
	expect(isValidEventstamp("2025-1-1T00:00:00.000Z|0001|a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00Z|0001|a1b2")).toBe(false); // missing milliseconds
});

test("isValidEventstamp() returns false for wrong delimiter", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z:0001:a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z-0001-a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z 0001 a1b2")).toBe(false);
});

test("isValidEventstamp() returns false for uppercase hex in counter", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|ABCD|a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|00FF|a1b2")).toBe(false);
});

test("isValidEventstamp() returns false for uppercase hex in nonce", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|ABCD")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|A1B2")).toBe(false);
});

test("isValidEventstamp() returns false for counter too short", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|001|a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|01|a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|1|a1b2")).toBe(false);
});

test("isValidEventstamp() returns false for nonce too short", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a1b")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|ab")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a")).toBe(false);
});

test("isValidEventstamp() returns false for nonce too long", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a1b2c")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a1b2c3")).toBe(false);
});

test("isValidEventstamp() returns false for non-hex characters in counter", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|00g1|a1b2")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|xyz1|a1b2")).toBe(false);
});

test("isValidEventstamp() returns false for non-hex characters in nonce", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|xyz1")).toBe(false);
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|g1b2")).toBe(false);
});

test("isValidEventstamp() returns false for empty string", () => {
	expect(isValidEventstamp("")).toBe(false);
});

test("isValidEventstamp() returns false for extra parts", () => {
	expect(isValidEventstamp("2025-01-01T00:00:00.000Z|0001|a1b2|extra")).toBe(
		false,
	);
});
