import { decodeEventstamp, encodeEventstamp } from "./eventstamp";

export type Clock = {
	now: () => string;
	latest: () => string;
	forward: (eventstamp: string) => void;
};

export const createClock = (): Clock => {
	let counter = 0;
	let lastMs = Date.now();

	return {
		now: (): string => {
			const nowMs = Date.now();

			if (nowMs <= lastMs) {
				counter++;
			} else {
				lastMs = nowMs;
				counter = 0;
			}

			return encodeEventstamp(nowMs, counter);
		},
		latest() {
			return encodeEventstamp(lastMs, counter);
		},
		forward(eventstamp: string): void {
			const latest = this.latest();
			if (eventstamp > latest) {
				const newer = decodeEventstamp(eventstamp);
				lastMs = newer.timestampMs;
				counter = newer.counter;
			}
		},
	};
};
