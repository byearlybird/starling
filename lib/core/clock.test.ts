import { expect, test } from "bun:test";
import { createClock } from "./clock";

test("now() returns ISO string with counter suffix", () => {
	const clock = createClock();
	const eventstamp = clock.now();

	// Format: ISO|hexCounter
	expect(eventstamp).toMatch(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{8}$/,
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
		const current = parseInt(counters[i]!, 16);
		const next = parseInt(counters[i + 1]!, 16);
		expect(next).toBe(current + 1);
	}
});

test("counter increments when real time hasn't caught up to forwarded time", () => {
	const clock = createClock();

	// Get initial eventstamp
	clock.now();

	// Move clock forward to a future time
	clock.forward(Date.now() + 1000);

	// Real time hasn't advanced that much yet, so counter increments
	const stamp2 = clock.now();
	const counterPart = stamp2.split("|")[1];
	expect(counterPart).toBeDefined();
	const counter2 = parseInt(counterPart || "", 16);

	// Counter should increment because real time <= forwarded lastMs
	expect(counter2).toBeGreaterThan(0);
});

test("time() returns last recorded millisecond", () => {
	const clock = createClock();

	const before = Date.now();
	clock.now();
	const after = Date.now();

	const time = clock.time();

	expect(time).toBeGreaterThanOrEqual(before);
	expect(time).toBeLessThanOrEqual(after);
});

test("forward() updates lastMs when timestamp is greater", () => {
	const clock = createClock();

	const initialTime = clock.time();
	const newTime = initialTime + 1000;

	clock.forward(newTime);

	expect(clock.time()).toBe(newTime);
});

test("forward() does not update lastMs when timestamp is not greater", () => {
	const clock = createClock();

	clock.now();
	const currentTime = clock.time();

	clock.forward(currentTime - 100);

	expect(clock.time()).toBe(currentTime);
});

test("forward() updates lastMs to allow counter reset when real time catches up", () => {
	const clock = createClock();

	// Generate an eventstamp first
	clock.now();

	// Move clock forward to a much later time
	const futureTime = clock.time() + 1000;
	clock.forward(futureTime);

	// Verify time was updated
	expect(clock.time()).toBe(futureTime);

	// When real time eventually catches up, counter will reset
	// (but since we can't manually advance real time, we test that forward updated lastMs)
	const currentTime = clock.time();
	expect(currentTime).toBe(futureTime);
});

test("getTimestampFromEventstamp() extracts ISO string correctly", () => {
	const clock = createClock();

	const eventstamp = clock.now();
	const timestamp = clock.getTimestampFromEventstamp(eventstamp);

	expect(typeof timestamp).toBe("number");
	expect(timestamp).toBeGreaterThan(0);
	expect(timestamp).toBeLessThanOrEqual(Date.now());
});

test("getTimestampFromEventstamp() returns matching timestamp from now()", () => {
	const clock = createClock();

	const eventstamp = clock.now();
	const extractedTime = clock.getTimestampFromEventstamp(eventstamp);
	const clockTime = clock.time();

	expect(extractedTime).toBe(clockTime);
});

test("getTimestampFromEventstamp() handles eventstamps with large counters", () => {
	const clock = createClock();

	// Generate many eventstamps to get a large counter
	for (let i = 0; i < 100; i++) {
		clock.now();
	}

	const eventstamp = clock.now();
	const timestamp = clock.getTimestampFromEventstamp(eventstamp);

	expect(typeof timestamp).toBe("number");
	expect(timestamp).toBeGreaterThan(0);
});

test("multiple clock instances are independent", () => {
	const clock1 = createClock();
	clock1.now();
	clock1.now();
	const stamp1 = clock1.now();

	const clock2 = createClock();
	clock2.now();
	const stamp2 = clock2.now();

	// Different instances maintain separate counters
	const counter1 = parseInt(stamp1.split("|")[1] || "", 16);
	const counter2 = parseInt(stamp2.split("|")[1] || "", 16);

	// clock1 called now() 3 times, counter increments each time: 1, 2, 3
	// clock2 called now() 2 times, counter increments each time: 1, 2
	expect(counter1).toBe(3);
	expect(counter2).toBe(2);
});

test("eventstamp format is consistent with padding", () => {
	const clock = createClock();

	// Generate many eventstamps to potentially exceed single hex digit
	for (let i = 0; i < 20; i++) {
		const eventstamp = clock.now();
		const parts = eventstamp.split("|");

		expect(parts.length).toBe(2);
		expect(parts[1]).toBeDefined();
		expect(parts[1]?.length).toBe(8);
		// Should be valid hex
		expect(/^[0-9a-f]{8}$/.test(parts[1] || "")).toBe(true);
	}
});
