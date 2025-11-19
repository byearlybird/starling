import { InvalidEventstampError } from "./errors";

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

const EVENTSTAMP_REGEX =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{4,}\|[0-9a-f]{4}$/;

/**
 * Validates whether a string is a properly formatted eventstamp.
 * Expected format: YYYY-MM-DDTHH:mm:ss.SSSZ|HHHH+|HHHH
 * where HHHH+ represents 4 or more hex characters for the counter,
 * and HHHH represents exactly 4 hex characters for the nonce.
 */
export function isValidEventstamp(stamp: string): boolean {
	return EVENTSTAMP_REGEX.test(stamp);
}

export function decodeEventstamp(eventstamp: string): {
	timestampMs: number;
	counter: number;
	nonce: string;
} {
	if (!isValidEventstamp(eventstamp)) {
		throw new InvalidEventstampError(eventstamp);
	}

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
