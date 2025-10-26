import { expect, test } from "bun:test";
import * as Eventstamp from "./eventstamp";

test("decode() extracts timestamp and counter correctly", () => {
	const eventstamp = Eventstamp.encode(1234567890123, 42);
	const { timestampMs, counter } = Eventstamp.decode(eventstamp);

	expect(timestampMs).toBe(1234567890123);
	expect(counter).toBe(42);
});

test("encode() decode() handles large counters", () => {
	const eventstamp = Eventstamp.encode(Date.now(), 0xffffffff);
	const { timestampMs, counter } = Eventstamp.decode(eventstamp);

	expect(counter).toBe(0xffffffff);
	expect(typeof timestampMs).toBe("number");
	expect(timestampMs).toBeGreaterThan(0);
});

test("encode() and decode() are inverses", () => {
	const originalTimestampMs = Date.now();
	const originalCounter = 12345;

	const eventstamp = Eventstamp.encode(originalTimestampMs, originalCounter);
	const { timestampMs, counter } = Eventstamp.decode(eventstamp);

	expect(timestampMs).toBe(originalTimestampMs);
	expect(counter).toBe(originalCounter);
});
