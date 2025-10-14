import { monotonicFactory } from "ulid";
import {
	createStorage,
	type Driver,
	type Storage,
	type WatchCallback,
} from "unstorage";
import { decode, encode, merge } from "./operations";
import type { DecodedObject, EncodedObject, StandardSchemaV1 } from "./types";

type Input<T extends StandardSchemaV1> = StandardSchemaV1.InferInput<T>;
type Output<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

type FlockConfig<
	TSchema extends StandardSchemaV1,
	TKey extends string = string,
> = {
	driver: Driver;
	schema: TSchema;
	getKey: (data: Output<TSchema>) => TKey;
};

export class Flock<
	TSchema extends StandardSchemaV1,
	TKey extends string = string,
> {
	#eventstamp: () => string;
	#storage: Storage;
	#schema: TSchema;
	#getKey: (data: Output<TSchema>) => TKey;

	constructor(config: FlockConfig<TSchema, TKey>) {
		this.#schema = config.schema;
		this.#getKey = config.getKey;
		this.#storage = createStorage({
			driver: config.driver,
		});
		this.#eventstamp = monotonicFactory();
	}

	async get(key: TKey): Promise<Output<TSchema> | null> {
		const current = await this.#storage.get<EncodedObject>(key);
		if (!current) return null;

		try {
			const decoded = decode(current);
			const validated = await standardValidate(this.#schema, decoded);
			return validated;
		} catch {
			return null;
		}
	}

	async insert(data: Input<TSchema>): Promise<TKey> {
		const validated = await this.#validate(data);
		const key = this.#getKey(validated);
		const encoded = this.#encode(validated);
		await this.#storage.set(key, encoded);
		return key;
	}

	async insertAll(data: Input<TSchema>[]): Promise<void> {
		const validated = await Promise.all(data.map((d) => this.#validate(d)));
		const items = validated.map((d) => ({
			key: this.#getKey(d),
			value: this.#encode(d),
		}));
		return this.#storage.setItems(items);
	}

	async update(key: TKey, data: Partial<Input<TSchema>>) {
		const current = await this.#storage.get<EncodedObject>(key);
		if (!current) {
			throw new Error(`Key Not Found - ${key}`);
		}
		const encoded = this.#encode(data);
		const merged = merge(current, encoded);
		const decoded = decode(merged);
		// Validate the result before inserting
		(await standardValidate(this.#schema, decoded)) as object;
		return this.#storage.set(key, merged);
	}

	watch(callback: WatchCallback) {
		return this.#storage.watch(callback);
	}

	#encode(data: unknown) {
		return encode(data as DecodedObject, this.#eventstamp);
	}

	#validate(data: Input<TSchema>) {
		return standardValidate(this.#schema, data);
	}
}

async function standardValidate<T extends StandardSchemaV1>(
	schema: T,
	input: Input<T>,
): Promise<Output<T>> {
	let result = schema["~standard"].validate(input);
	if (result instanceof Promise) result = await result;

	// if the `issues` field exists, the validation failed
	if (result.issues) {
		throw new Error(JSON.stringify(result.issues, null, 2));
	}

	return result.value;
}
