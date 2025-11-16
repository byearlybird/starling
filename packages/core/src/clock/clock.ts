import {
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
	isValidEventstamp,
} from "./eventstamp";

/**
 * A Hybrid Logical Clock that generates monotonically increasing eventstamps.
 * Combines wall-clock time with a counter for handling clock stalls and a
 * random nonce for tie-breaking.
 *
 * The clock automatically increments the counter when the wall clock doesn't
 * advance, ensuring eventstamps are always unique and monotonic.
 */
export type Clock = ReturnType<typeof createClock>;

export function createClock() {
	let counter = 0;
	let lastMs = Date.now();
	let lastNonce = generateNonce();

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
			return;
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
