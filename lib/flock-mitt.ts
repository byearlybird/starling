import type { Emitter as BaseEmitter } from "mitt";
import mitt from "mitt";
import { decode, encode } from "./operations";
import type { EncodedObject } from "./types";

type Events<TValue> = {
	insert: { key: string; data: TValue };
	["query-register"]: {
		key: string;
		predicate: QueryPredicate<TValue>;
		callback: QueryCallback<TValue>;
	};
	["query-unregister"]: {
		key: string;
	};
	["query-run"]: {
		key: string;
	};
	["query-results"]: {
		key: string;
		results: DecodedState<TValue>;
	};
};

type Emitter<TValue> = BaseEmitter<Events<TValue>>;
type State = Map<string, EncodedObject>;
type DecodedState<TValue> = Map<string, TValue>;

type QueryPredicate<TValue> = (data: TValue) => boolean;
type QueryCallback<TValue> = (results: Map<string, TValue>) => void;
type QueryMap<TValue> = Map<
	string,
	{
		predicate: QueryPredicate<TValue>;
		callback: QueryCallback<TValue>;
		results: DecodedState<TValue>;
	}
>;

export function createFlockState<TValue extends object>() {
	const emitter_: Emitter<TValue> = mitt<Events<TValue>>();
	const state_: State = new Map();
	const queries_: QueryMap<TValue> = new Map();

	emitter_.on("insert", (entity) => {
		const encoded = encode(entity.data, () => new Date().toISOString());
		state_.set(entity.key, encoded);
		for (const [key, query] of queries_.entries()) {
			if (query.predicate(entity.data)) {
				query.results.set(key, entity.data);
				emitter_.emit("query-results", { key, results: query.results });
			}
		}
	});

	emitter_.on("query-register", (query) => {
		queries_.set(query.key, {
			predicate: query.predicate,
			callback: query.callback,
			results: new Map(),
		});
		emitter_.emit("query-run", { key: query.key });
	});

	emitter_.on("query-unregister", ({ key: queryKey }) => {
		queries_.delete(queryKey);
	});

	emitter_.on("query-run", ({ key: queryKey }) => {
		const query = queries_.get(queryKey);
		if (!query) throw new Error(`Query not found: ${queryKey}`);

		const results: Map<string, TValue> = new Map();
		for (const [key, item] of state_.entries()) {
			const decoded = decode(item) as TValue;
			if (query.predicate(decoded)) {
				results.set(key, decoded);
			}
		}

		emitter_.emit("query-results", { key: queryKey, results });
	});

	emitter_.on("query-results", ({ key: queryKey, results }) => {
		const query = queries_.get(queryKey);
		if (!query) throw new Error(`Query not found: ${queryKey}`);

		query.results = results;
		query.callback(results);
	});

	return {
		insert: (key: string, data: TValue) => {
			emitter_.emit("insert", { key, data });
		},
		query: (
			key: string,
			predicate: QueryPredicate<TValue>,
			callback: QueryCallback<TValue>,
		) => {
			emitter_.emit("query-register", { key, predicate, callback });

			return () => {
				emitter_.emit("query-unregister", { key });
			};
		},
	};
}
