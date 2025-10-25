// value, eventstamp, 1 = leaf flag
export type SerializedValue<T = unknown> = [T, string, 1];

export class $Value<T = unknown> {
	#eventstamp: string;
	#data: T;

	constructor(value: T, eventstamp: string) {
		this.#data = value;
		this.#eventstamp = eventstamp;
	}

	get eventstamp(): string {
		return this.#eventstamp;
	}

	get data(): T {
		return this.#data;
	}

	setData(data: T) {
		this.#data = data;
	}

	serialize(): SerializedValue<T> {
		return [this.#data, this.#eventstamp, 1];
	}

	static deserialize<T>(value: SerializedValue<T>) {
		return new $Value<T>(value[0] as T, value[1]);
	}
}

// [property, value]
type SerializedRecord<T = unknown> = [
	string,
	SerializedValue<T> | SerializedRecord<T>,
];

export class $Record<T = unknown> {
	#property: string;
	#data: $Value<T> | $Record<T>;

	constructor(property: string, data: $Value<T> | $Record<T>) {
		this.#property = property;
		this.#data = data;
	}

	get property(): string {
		return this.#property;
	}

	get data(): $Value<T> | $Record<T> {
		return this.#data;
	}

	setData(data: $Value<T> | $Record<T>) {
		this.#data = data;
	}

	merge(record: $Record<T>): boolean {
		// Recursive merge for nested fields
		if (this.#data instanceof $Record && record.#data instanceof $Record) {
			return this.#data.merge(record.#data);
		}

		// LWW for value fields
		if (this.#data instanceof $Value && record.#data instanceof $Value) {
			if (this.#data.eventstamp >= record.#data.eventstamp) return false;
			this.#data = record.#data;
			return true;
		}

		// Type mismatch (one is a value, the other is a field);
		throw new Error(
			`Cannot merge field "${this.#property}": structure changed from ${this.#data instanceof $Value ? "value" : "field"} to ${record.#data instanceof $Value ? "value" : "field"}`,
		);
	}

	serialize(): SerializedRecord<T> {
		return [this.#property, this.#data.serialize()];
	}

	static deserialize<T>(record: SerializedRecord<T>): $Record<T> {
		const [property, value] = record;
		// value is either a leaf value, or another record
		if (value[2] === 1) {
			// its a leaf value
			const $value = $Value.deserialize(value as SerializedValue<T>);
			return new $Record(property, $value);
		} else {
			// its a nested record - deserialize recursively
			const nestedRecord = $Record.deserialize(value as SerializedRecord<T>);
			return new $Record(property, nestedRecord);
		}
	}

	static from<T extends Record<string, unknown>>(
		record: T,
		eventstamp: string,
	): $Record<T> {
		const keys = Object.keys(record);
		let current: $Value<unknown> | $Record<unknown> | null = null;

		// Process keys in reverse to build nested $Record structure
		for (let i = keys.length - 1; i >= 0; i--) {
			const key = keys[i] as string;
			const value = record[key];

			if (
				typeof value === "object" &&
				!Array.isArray(value) &&
				value !== null &&
				Object.getPrototypeOf(value) === Object.prototype
			) {
				// Nested plain object - recursively create $Record
				const nested = $Record.from(
					value as Record<string, unknown>,
					eventstamp,
				);
				current = new $Record(key, current !== null ? current : nested);
			} else {
				// Leaf value - wrap in $Value
				current = new $Record(
					key,
					current !== null ? current : new $Value(value, eventstamp),
				);
			}
		}

		return (
			current !== null
				? current
				: new $Record("root", new $Value({}, eventstamp))
		) as $Record<T>;
	}
}

// id, data, version, is deleted flag
type SerializedDocument<T = unknown> = [
	string,
	SerializedRecord<T>,
	number,
	0 | 1,
];

export class $Document<T = unknown> {
	#id: string;
	#data: $Record<T>;
	#version: number;
	#deleted: boolean;

	constructor(id: string, data: $Record<T>, version: number, deleted: boolean) {
		this.#id = id;
		this.#data = data;
		this.#version = version;
		this.#deleted = deleted;
	}

	setDeleted(deleted: boolean) {
		this.#deleted = deleted;
	}

	serialize(): SerializedDocument<T> {
		return [
			this.#id,
			this.#data.serialize(),
			this.#version,
			this.#deleted ? 1 : 0,
		];
	}

	static deserialize<T = unknown>(entity: SerializedDocument<T>) {
		const [id, data, version, isDeleted] = entity;
		const record = $Record.deserialize(data);
		return new $Document(id, record, version, isDeleted === 1);
	}

	static from<T extends Record<string, unknown>>(
		id: string,
		data: T,
		eventstamp: string,
		version: number,
		deleted: boolean,
	) {
		const record = $Record.from(data, eventstamp);
		return new $Document(id, record, version, deleted);
	}
}
