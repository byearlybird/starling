import * as $eventsamp from "./eventstamp";

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

			return $eventsamp.encode(nowMs, counter);
		},
		latest() {
			return $eventsamp.encode(lastMs, counter);
		},
		forward(eventstamp: string): void {
			const latest = this.latest();
			if (eventstamp > latest) {
				const newer = $eventsamp.decode(eventstamp);
				lastMs = newer.timestampMs;
				counter = newer.counter;
			}
		},
	};
};

export type { Clock };
export { create };
