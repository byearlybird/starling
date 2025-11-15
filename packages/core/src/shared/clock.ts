import {
	decodeEventstamp,
	encodeEventstamp,
	generateNonce,
	isValidEventstamp,
} from "../crdt/eventstamp";

/**
 * A Hybrid Logical Clock that generates monotonically increasing eventstamps.
 * Combines wall-clock time with a counter for handling clock stalls and a
 * random nonce for tie-breaking.
 *
 * The clock automatically increments the counter when the wall clock doesn't
 * advance, ensuring eventstamps are always unique and monotonic.
 */
export class Clock {
	#counter = 0;
	#lastMs = Date.now();
	#lastNonce = generateNonce();

	/** Generates a new eventstamp, advancing the clock */
	now(): string {
		const wallMs = Date.now();

		if (wallMs > this.#lastMs) {
			this.#lastMs = wallMs;
			this.#counter = 0;
			this.#lastNonce = generateNonce();
		} else {
			this.#counter++;
			this.#lastNonce = generateNonce();
		}

		return encodeEventstamp(this.#lastMs, this.#counter, this.#lastNonce);
	}

	/** Returns the most recent eventstamp without advancing the clock */
	latest(): string {
		return encodeEventstamp(this.#lastMs, this.#counter, this.#lastNonce);
	}

	/** Fast-forwards the clock to match a newer remote eventstamp */
	forward(eventstamp: string): void {
		if (!isValidEventstamp(eventstamp)) {
			return;
		}

		const latest = this.latest();
		if (eventstamp > latest) {
			const newer = decodeEventstamp(eventstamp);
			this.#lastMs = newer.timestampMs;
			this.#counter = newer.counter;
			this.#lastNonce = newer.nonce;
		}
	}
}
