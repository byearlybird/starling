import { expect, test } from "bun:test";
import {
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
} from "./eventstamp";

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
