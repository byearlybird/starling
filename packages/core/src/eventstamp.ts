const encode = (timestampMs: number, counter: number): string => {
	const isoString = new Date(timestampMs).toISOString();
	return `${isoString}|${counter.toString(16).padStart(8, "0")}`;
};

const decode = (
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

export { encode, decode };
