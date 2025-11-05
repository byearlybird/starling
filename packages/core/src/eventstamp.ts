export function generateNonce(): string {
	// Generate a random 4-character hex nonce for tie-breaking
	return Math.random().toString(16).slice(2, 6).padStart(4, "0");
}

export function encodeEventstamp(
	timestampMs: number,
	counter: number,
	nonce: string,
): string {
	const isoString = new Date(timestampMs).toISOString();
	const counterHex = counter.toString(16).padStart(4, "0");
	return `${isoString}|${counterHex}|${nonce}`;
}

export function decodeEventstamp(eventstamp: string): {
	timestampMs: number;
	counter: number;
	nonce: string;
} {
	const parts = eventstamp.split("|");
	const isoString = parts[0] as string;
	const hexCounter = parts[1] as string;
	const nonce = parts[2] as string;

	return {
		timestampMs: new Date(isoString).getTime(),
		counter: parseInt(hexCounter, 16),
		nonce,
	};
}

export const MIN_EVENTSTAMP = encodeEventstamp(0, 0, "0000");
