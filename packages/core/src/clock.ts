import * as Eventstamp from "./eventstamp";

type Clock = {
	now: () => string;
	latest: () => string;
	forward: (eventstamp: string) => void;
};

const create = (): Clock => {
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

			return Eventstamp.encode(nowMs, counter);
		},
		latest() {
			return Eventstamp.encode(lastMs, counter);
		},
		forward(eventstamp: string): void {
			const latest = this.latest();
			if (eventstamp > latest) {
				const newer = Eventstamp.decode(eventstamp);
				lastMs = newer.timestampMs;
				counter = newer.counter;
			}
		},
	};
};

export type { Clock };
export { create };
