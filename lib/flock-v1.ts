import type { Emitter as BaseEmitter } from "mitt";
import mitt from "mitt";
import { decode, encode } from "./operations";
import type { EncodedObject } from "./types";

type Events<TValue> = {
	insert: { key: string; data: TValue };
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
