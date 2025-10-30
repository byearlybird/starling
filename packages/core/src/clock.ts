import { decodeEventstamp, encodeEventstamp, generateNonce } from "./eventstamp";

export type Clock = {
	now: () => string;
	latest: () => string;
	forward: (eventstamp: string) => void;
};

export const createClock = (): Clock => {
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
};
