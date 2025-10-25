import type { EncodedObject } from "@byearlybird/starling-crdt";
import { decode } from "@byearlybird/starling-crdt";

type Predicate<T> = (data: T) => boolean;
type Callback = () => void;

type QueryInternal<T> = {
	predicate: Predicate<T>;
	results: Map<string, T>;
	callbacks: Set<Callback>;
};

const createQuery = <T extends object>(
	map: Map<string, EncodedObject>,
	queries: Set<QueryInternal<T>>,
) => {
	return (predicate: Predicate<T>) => {
		const results = new Map<string, T>();

		for (const [key, rawValue] of map.entries()) {
			const value = decode<T>(rawValue);
			if (predicate(value)) {
				results.set(key, value);
			}
		}

		const internal: QueryInternal<T> = {
			predicate,
			results,
			callbacks: new Set<Callback>(),
		};

		queries.add(internal);

		return {
			results() {
				return results;
			},
			onChange: (callback: Callback) => {
				internal.callbacks.add(callback);

				return () => {
					internal.callbacks.delete(callback);
				};
			},
			dispose: () => {
				internal.callbacks.clear();
				queries.delete(internal);
			},
		};
	};
};

export { createQuery };
export type { QueryInternal, Predicate, Callback };
