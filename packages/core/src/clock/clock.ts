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
export class Clock {
	private counter: number;
	private lastMs: number;
	private lastNonce: string;

	constructor() {
		this.counter = 0;
		this.lastMs = Date.now();
		this.lastNonce = generateNonce();
	}

	/**
	 * Create a Clock from an eventstamp string.
	 * @param eventstamp - Eventstamp string to decode and initialize clock from
	 * @throws Error if eventstamp is invalid
	 * @returns A new Clock instance initialized to the decoded eventstamp
	 */
	static fromEventstamp(eventstamp: string): Clock {
		if (!isValidEventstamp(eventstamp)) {
			throw new Error(
				`Invalid eventstamp format: "${eventstamp}". Expected format: YYYY-MM-DDTHH:mm:ss.SSSZ|HHHH+|HHHH`,
			);
		}

		const decoded = decodeEventstamp(eventstamp);
		const clock = new Clock();
		clock.lastMs = decoded.timestampMs;
		clock.counter = decoded.counter;
		clock.lastNonce = decoded.nonce;
		return clock;
	}

	/**
	 * Generate a new eventstamp, incrementing the counter if wall clock hasn't advanced.
	 * @returns A new eventstamp string
	 */
	now(): string {
		const wallMs = Date.now();

		if (wallMs > this.lastMs) {
			this.lastMs = wallMs;
			this.counter = 0;
			this.lastNonce = generateNonce();
		} else {
			this.counter++;
			this.lastNonce = generateNonce();
		}

		return encodeEventstamp(this.lastMs, this.counter, this.lastNonce);
	}

	/**
	 * Get the latest eventstamp without advancing the clock.
	 * @returns The current eventstamp
	 */
	latest(): string {
		return encodeEventstamp(this.lastMs, this.counter, this.lastNonce);
	}

	/**
	 * Forward the clock to the given eventstamp if it's newer than current.
	 * @param eventstamp - Eventstamp to fast-forward to
	 */
	forward(eventstamp: string): void {
		if (!isValidEventstamp(eventstamp)) {
			return;
		}

		const current = this.latest();
		if (eventstamp > current) {
			const newer = decodeEventstamp(eventstamp);
			this.lastMs = newer.timestampMs;
			this.counter = newer.counter;
			this.lastNonce = newer.nonce;
		}
	}
}
