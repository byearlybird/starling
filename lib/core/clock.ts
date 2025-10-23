const formatEventstamp = (timestampMs: number, counter: number): string => {
	const isoString = new Date(timestampMs).toISOString();
	return `${isoString}|${counter.toString(16).padStart(8, "0")}`;
};

const parseEventstamp = (
	eventstamp: string,
): { timestampMs: number; counter: number } => {
	const pipeIndex = eventstamp.indexOf("|");
	const isoString = eventstamp.slice(0, pipeIndex);
	const hexCounter = eventstamp.slice(pipeIndex + 1);

	return {
		timestampMs: new Date(isoString).getTime(),
		counter: parseInt(hexCounter, 16),
	};
};

const createClock = () => {
	let counter = 0;
	let lastMs = Date.now();

	return {
		/**
		 * Returns the next monotonically increasing eventstamp.
		 */
		now(): string {
			const nowMs = Date.now();

			if (nowMs <= lastMs) {
				counter++;
			} else {
				lastMs = nowMs;
				counter = 0;
			}

			return formatEventstamp(nowMs, counter);
		},

		latest(): string {
			return formatEventstamp(lastMs, counter);
		},

		forward(eventstamp: string): void {
			const latest = this.latest();
			if (eventstamp > latest) {
				const newer = parseEventstamp(eventstamp);
				lastMs = newer.timestampMs;
				counter = newer.counter;
			}
		},
	};
};

export { createClock, formatEventstamp, parseEventstamp };
