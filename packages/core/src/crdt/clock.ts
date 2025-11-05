import {
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
} from "./eventstamp";

/**
 * A Hybrid Logical Clock that generates monotonically increasing eventstamps.
 * Combines wall-clock time with a counter for handling clock stalls and a
 * random nonce for tie-breaking.
 *
 * The clock automatically increments the counter when the wall clock doesn't
 * advance, ensuring eventstamps are always unique and monotonic.
 */
export type Clock = {
	/** Generates a new eventstamp, advancing the clock */
	now: () => string;
	/** Returns the most recent eventstamp without advancing the clock */
	latest: () => string;
	/** Fast-forwards the clock to match a newer remote eventstamp */
	forward: (eventstamp: string) => void;
};

export function createClock(): Clock {
	let counter = 0;
	let lastMs = Date.now();
	let lastNonce = generateNonce();

	return {
		now: (): string => {
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
		},
		latest() {
			return encodeEventstamp(lastMs, counter, lastNonce);
		},
		forward(eventstamp: string): void {
			const latest = this.latest();
			if (eventstamp > latest) {
				const newer = decodeEventstamp(eventstamp);
				lastMs = newer.timestampMs;
				counter = newer.counter;
				lastNonce = newer.nonce;
			}
		},
	};
}
