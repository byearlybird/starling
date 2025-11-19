import {
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
	isValidEventstamp,
} from "./eventstamp";
import { InvalidEventstampError } from "./errors";

/**
 * A Hybrid Logical Clock that generates monotonically increasing eventstamps.
 * Combines wall-clock time with a counter for handling clock stalls and a
 * random nonce for tie-breaking.
 *
 * The clock automatically increments the counter when the wall clock doesn't
 * advance, ensuring eventstamps are always unique and monotonic.
 *
 * @example
 * ```typescript
 * const clock = createClock();
 * const stamp1 = clock.now();
 * const stamp2 = clock.now();
 * ```
 */
export type Clock = ReturnType<typeof createClock>;

/**
 * Create a new Clock instance.
 * @param initialState - Optional initial state for the clock
 */
export function createClock(initialState?: {
	counter: number;
	lastMs: number;
	lastNonce: string;
}) {
	let counter = initialState?.counter ?? 0;
	let lastMs = initialState?.lastMs ?? Date.now();
	let lastNonce = initialState?.lastNonce ?? generateNonce();

	const now = (): string => {
		const wallMs = Date.now();

		if (wallMs > lastMs) {
			lastMs = wallMs;
			counter = 0;
			lastNonce = generateNonce();
		} else {
			counter++;
			lastNonce = generateNonce();
		}

		return encodeEventstamp(lastMs, counter, lastNonce);
	};

	const latest = (): string => encodeEventstamp(lastMs, counter, lastNonce);

	const forward = (eventstamp: string): void => {
		if (!isValidEventstamp(eventstamp)) {
			throw new InvalidEventstampError(eventstamp);
		}

		const current = latest();
		if (eventstamp > current) {
			const newer = decodeEventstamp(eventstamp);
			lastMs = newer.timestampMs;
			counter = newer.counter;
			lastNonce = newer.nonce;
		}
	};

	return {
		now,
		latest,
		forward,
	};
}

/**
 * Create a Clock from an eventstamp string.
 * @param eventstamp - Eventstamp string to decode and initialize clock from
 * @throws Error if eventstamp is invalid
 */
export function createClockFromEventstamp(eventstamp: string): Clock {
	if (!isValidEventstamp(eventstamp)) {
		throw new Error(`Invalid eventstamp: "${eventstamp}"`);
	}

	const decoded = decodeEventstamp(eventstamp);
	return createClock({
		counter: decoded.counter,
		lastMs: decoded.timestampMs,
		lastNonce: decoded.nonce,
	});
}
