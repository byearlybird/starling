import { expect, test } from "bun:test";
import { decodeEventstamp, encodeEventstamp } from "./eventstamp";

test("decode() extracts timestamp and counter correctly", () => {
	const eventstamp = encodeEventstamp(1234567890123, 42);
	const { timestampMs, counter } = decodeEventstamp(eventstamp);

	expect(timestampMs).toBe(1234567890123);
	expect(counter).toBe(42);
});

test("encode() decode() handles large counters", () => {
	const eventstamp = encodeEventstamp(Date.now(), 0xffffffff);
	const { timestampMs, counter } = decodeEventstamp(eventstamp);

	expect(counter).toBe(0xffffffff);
	expect(typeof timestampMs).toBe("number");
	expect(timestampMs).toBeGreaterThan(0);
});

test("encode() and decode() are inverses", () => {
	const originalTimestampMs = Date.now();
	const originalCounter = 12345;

	const eventstamp = encodeEventstamp(originalTimestampMs, originalCounter);
	const { timestampMs, counter } = decodeEventstamp(eventstamp);

	expect(timestampMs).toBe(originalTimestampMs);
	expect(counter).toBe(originalCounter);
});
