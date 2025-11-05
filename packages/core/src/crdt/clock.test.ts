import { expect, test } from "bun:test";
import {
	createClock,
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
} from ".";

test("now() returns ISO string with counter and nonce suffix", () => {
	const clock = createClock();
	const eventstamp = clock.now();

	// Format: ISO|hexCounter|hexNonce
	expect(eventstamp).toMatch(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{4}\|[0-9a-f]{4}$/,
	);
});

test("now() returns monotonically increasing eventstamps", () => {
	const clock = createClock();

	const stamp1 = clock.now();
	const stamp2 = clock.now();
	const stamp3 = clock.now();

	expect(stamp1 < stamp2).toBe(true);
	expect(stamp2 < stamp3).toBe(true);
});

test("counter increments when called multiple times in same millisecond", () => {
	const clock = createClock();

	const stamps = [];
	for (let i = 0; i < 5; i++) {
		stamps.push(clock.now());
	}

	// All should have same ISO timestamp but different counters
	const iso = stamps[0]?.split("|")[0];
	expect(iso).toBeDefined();

	const counters = stamps.map((s) => {
		const parts = s.split("|");
		expect(parts[1]).toBeDefined();
		return parts[1] || "";
	});

	for (let i = 0; i < stamps.length; i++) {
		const parts = stamps[i]?.split("|");
		const isoPart = parts?.[0];
		expect(isoPart).toBeDefined();
		expect(isoPart).toBe(iso);
	}

	// Counters should be sequential hex values
	for (let i = 0; i < counters.length - 1; i++) {
		// biome-ignore lint/style/noNonNullAssertion: <test>
		const current = parseInt(counters[i]!, 16);
		// biome-ignore lint/style/noNonNullAssertion: <test>
		const next = parseInt(counters[i + 1]!, 16);
		expect(next).toBe(current + 1);
	}
});

test("counter increments when real time hasn't caught up to forwarded time", () => {
	const clock = createClock();

	// Get initial eventstamp
	clock.now();

	// Move clock forward to a future eventstamp
	const futureEventstamp = encodeEventstamp(
		Date.now() + 1000,
		0,
		generateNonce(),
	);
	clock.forward(futureEventstamp);

	// Real time hasn't advanced that much yet, so counter increments
	const stamp2 = clock.now();
	const counterPart = stamp2.split("|")[1];
	expect(counterPart).toBeDefined();
	const counter2 = parseInt(counterPart || "", 16);

	// Counter should increment because real time <= forwarded lastMs
	expect(counter2).toBeGreaterThan(0);
});

test("latest() returns last recorded eventstamp", () => {
	const clock = createClock();

	const stamp = clock.now();
	const latest = clock.latest();

	expect(latest).toBe(stamp);
	expect(latest).toMatch(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{4}\|[0-9a-f]{4}$/,
	);
});

test("forward() updates lastMs when eventstamp is greater", () => {
	const clock = createClock();

	const initialStamp = clock.latest();
	const { timestampMs } = decodeEventstamp(initialStamp);
	const newEventstamp = encodeEventstamp(
		timestampMs + 1000,
		0,
		generateNonce(),
	);

	clock.forward(newEventstamp);

	expect(clock.latest()).toBe(newEventstamp);
});

test("forward() does not update lastMs when eventstamp is not greater", () => {
	const clock = createClock();

	clock.now();
	const currentStamp = clock.latest();

	const { timestampMs } = decodeEventstamp(currentStamp);
	const olderEventstamp = encodeEventstamp(
		timestampMs - 100,
		0,
		generateNonce(),
	);

	clock.forward(olderEventstamp);

	expect(clock.latest()).toBe(currentStamp);
});

test("forward() updates lastMs to allow counter reset when real time catches up", () => {
	const clock = createClock();

	// Generate an eventstamp first
	clock.now();

	// Move clock forward to a much later time
	const currentStamp = clock.latest();
	const { timestampMs } = decodeEventstamp(currentStamp);
	const futureEventstamp = encodeEventstamp(
		timestampMs + 1000,
		0,
		generateNonce(),
	);
	clock.forward(futureEventstamp);

	// Verify eventstamp was updated
	expect(clock.latest()).toBe(futureEventstamp);

	// When real time eventually catches up, counter will reset
	// (but since we can't manually advance real time, we test that forward updated lastMs)
	const currentEventstamp = clock.latest();
	expect(currentEventstamp).toBe(futureEventstamp);
});

test("eventstamp format is consistent with padding", () => {
	const clock = createClock();

	// Generate many eventstamps to potentially exceed single hex digit
	for (let i = 0; i < 20; i++) {
		const eventstamp = clock.now();
		const parts = eventstamp.split("|");

		expect(parts.length).toBe(3);
		expect(parts[1]).toBeDefined();
		expect(parts[1]?.length).toBe(4);
		expect(parts[2]).toBeDefined();
		expect(parts[2]?.length).toBe(4);
		// Should be valid hex
		expect(/^[0-9a-f]{4}$/.test(parts[1] || "")).toBe(true);
		expect(/^[0-9a-f]{4}$/.test(parts[2] || "")).toBe(true);
	}
});
