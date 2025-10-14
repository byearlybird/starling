import type { Emitter, Handler } from "mitt";
import mitt from "mitt";
import { monotonicFactory } from "ulid";
import { encode as baseEncode, decode } from "./operations";
import type { EncodedObject } from "./types";

const eventstampFn = monotonicFactory();
const encode = (data: object) => baseEncode(data, eventstampFn);

type QueryData<TValue> = {
	results: Map<string, TValue>;
	predicate: (data: TValue) => boolean;
};

type Events<TValue> = {
	insert: { key: string; data: TValue };
	query: {
		queryKey: string;
		type: "init" | "mutation";
		results: Map<string, TValue>;
	};
};

export class Flock<TValue extends object> {
	#emitter: Emitter<Events<TValue>>;
	#data: Map<string, EncodedObject>;
	#queries: Map<string, QueryData<TValue>>;

	constructor() {
		this.#emitter = mitt<Events<TValue>>();
		this.#data = new Map();
		this.#queries = new Map();
		this.#emitter.on("insert", ({ data }) => {
			for (const [queryKey, query] of this.#queries.entries()) {
				const isMatch = query.predicate(data);
				if (isMatch) {
					const results = [...query.results, data];
					this.#emitter.emit("query", { queryKey, type: "mutation", results });
				}
			}
		});
	}

	insert(key: string, data: TValue) {
		const encoded = encode(data);
		this.#data.set(key, encoded);
		this.#emitter.emit("insert", { key, data });
	}

	query(
		queryKey: string,
		predicate: (data: TValue) => boolean,
		callback: (results: Map<string, TValue>) => void,
	) {
		const unsubscribe = this.#registerQueryHandler(queryKey, callback);
		const results = runQuery(this.#data, predicate);
		this.#emitter.emit("query", { queryKey, type: "init", results });
		this.#queries.set(queryKey, {
			results,
			predicate,
		});

		return unsubscribe;
	}

	#registerQueryHandler(
		queryKey: string,
		callback: (results: Map<string, TValue>) => void,
	) {
		const handler: Handler<Events<TValue>["query"]> = (event) => {
			if (event.queryKey === queryKey) {
				callback(event.results);
			}
		};
		this.#emitter.on("query", handler);
		return this.#emitter.off("query", handler);
	}
}

function runQuery<TValue>(
	data: Map<string, EncodedObject>,
	predicate: (data: TValue) => boolean,
) {
	const results: Map<string, TValue> = new Map();

	for (const [key, item] of data.entries()) {
		const decoded = decode(item) as TValue;
		if (predicate(decoded)) {
			results.set(key, decoded);
		}
	}

	return results;
}
