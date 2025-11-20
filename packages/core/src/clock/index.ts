export type { Clock } from "./clock";
export { createClock, createClockFromEventstamp } from "./clock";
export { InvalidEventstampError } from "./errors";
export {
	isValidEventstamp,
	maxEventstamp,
	MIN_EVENTSTAMP,
} from "./eventstamp";
