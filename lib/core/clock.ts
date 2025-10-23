const createClock = () => {
	let counter = 0;
	let lastMs = Date.now();

	return {
		/**
		 * Returns the next monotonically increasing eventstamp.
		 */
		now(): string {
			const nowMs = Date.now();
			const isoString = new Date(nowMs).toISOString();

			if (nowMs <= lastMs) {
				counter++;
			} else {
				lastMs = nowMs;
				counter = 0;
			}

			return `${isoString}|${counter.toString(16).padStart(8, "0")}`;
		},

		time(): number {
			return lastMs;
		},

		forward(timestamp: number): void {
			if (timestamp > lastMs) {
				lastMs = timestamp;
				counter = 0;
			}
		},

		getTimestampFromEventstamp(eventstamp: string): number {
			const iso = eventstamp.slice(0, eventstamp.indexOf("|"));
			return new Date(iso).time();
		},
	};
};

export { createClock };
