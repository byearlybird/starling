export type { Clock } from "./clock";
export { createClock, createClockFromEventstamp } from "./clock";
export { InvalidEventstampError } from "./errors";
export {
	isValidEventstamp,
	MIN_EVENTSTAMP,
	maxEventstamp,
} from "./eventstamp";
