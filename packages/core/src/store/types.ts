/**
 * Internal query state used by the Store implementation.
 * @internal
 */
export type QueryInternal<T, U> = {
	where: (data: T) => boolean;
	select?: (data: T) => U;
	order?: (a: U, b: U) => number;
	results: Map<string, U>;
	callbacks: Set<() => void>;
};
