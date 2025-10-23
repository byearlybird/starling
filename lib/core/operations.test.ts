import { expect, test } from "bun:test";
import { decode, encode, merge, mergeArray } from "./operations";
import type { EncodedObject } from "./types";

test("encode converts a flat object to encoded format", () => {
	const obj = { name: "Alice", age: 30 };
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = encode(obj, eventstamp);

	expect(encoded).toEqual({
		name: {
			__value: "Alice",
			__eventstamp: eventstamp,
		},
		age: {
			__value: 30,
			__eventstamp: eventstamp,
		},
	});
});

test("encode converts a nested object to encoded format", () => {
	const obj = {
		user: {
			name: "Bob",
			profile: {
				age: 25,
			},
		},
	};
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = encode(obj, eventstamp);

	expect(encoded).toEqual({
		user: {
			name: {
				__value: "Bob",
				__eventstamp: eventstamp,
			},
			profile: {
				age: {
					__value: 25,
					__eventstamp: eventstamp,
				},
			},
		},
	});
});

test("decode converts encoded object back to original format", () => {
	const encoded: EncodedObject = {
		name: {
			__value: "Charlie",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
		age: {
			__value: 35,
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};

	const decoded = decode(encoded);

	expect(decoded).toEqual({
		name: "Charlie",
		age: 35,
	});
});

test("decode converts encoded nested object back to original format", () => {
	const encoded: EncodedObject = {
		user: {
			name: {
				__value: "Diana",
				__eventstamp: "2024-01-01T00:00:00Z",
			},
			profile: {
				age: {
					__value: 28,
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			},
		},
	};

	const decoded = decode(encoded);

	expect(decoded).toEqual({
		user: {
			name: "Diana",
			profile: {
				age: 28,
			},
		},
	});
});

test("encode then decode round-trip preserves data", () => {
	const original = {
		id: 123,
		title: "Test",
		metadata: {
			author: "Eve",
			tags: ["test", "example"],
		},
	};
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = encode(original, eventstamp);
	const decoded = decode(encoded);

	expect(decoded).toEqual(original);
});

test("merge combines two objects with only first object properties", () => {
	const obj1: EncodedObject = {
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};
	const obj2: EncodedObject = {
		age: {
			__value: 30,
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};

	const [merged, changed] = merge(obj1, obj2);

	expect(merged).toEqual({
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
		age: {
			__value: 30,
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	});
	expect(changed).toBe(true); // New property added
});

test("merge prefers newer eventstamp when properties conflict", () => {
	const obj1: EncodedObject = {
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};
	const obj2: EncodedObject = {
		name: {
			__value: "Bob",
			__eventstamp: "2024-01-02T00:00:00Z",
		},
	};

	const [merged, changed] = merge(obj1, obj2);

	expect(merged).toEqual({
		name: {
			__value: "Bob",
			__eventstamp: "2024-01-02T00:00:00Z",
		},
	});
	expect(changed).toBe(true); // obj2 had newer value
});

test("merge prefers older value when first eventstamp is newer", () => {
	const obj1: EncodedObject = {
		score: {
			__value: 100,
			__eventstamp: "2024-01-03T00:00:00Z",
		},
	};
	const obj2: EncodedObject = {
		score: {
			__value: 50,
			__eventstamp: "2024-01-02T00:00:00Z",
		},
	};

	const [merged, changed] = merge(obj1, obj2);

	expect(merged).toEqual({
		score: {
			__value: 100,
			__eventstamp: "2024-01-03T00:00:00Z",
		},
	});
	expect(changed).toBe(false); // obj1's value was kept (no change)
});

test("merge handles objects with different properties", () => {
	const obj1: EncodedObject = {
		name: {
			__value: "Charlie",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
		age: {
			__value: 25,
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};
	const obj2: EncodedObject = {
		age: {
			__value: 30,
			__eventstamp: "2024-01-02T00:00:00Z",
		},
		city: {
			__value: "NYC",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};

	const [merged, changed] = merge(obj1, obj2);

	expect(merged).toEqual({
		name: {
			__value: "Charlie",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
		age: {
			__value: 30,
			__eventstamp: "2024-01-02T00:00:00Z",
		},
		city: {
			__value: "NYC",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	});
	expect(changed).toBe(true); // Both age was updated and city was added
});

test("merge returns changed=false when merging identical objects", () => {
	const obj1: EncodedObject = {
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};
	const obj2: EncodedObject = {
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	};

	const [merged, changed] = merge(obj1, obj2);

	expect(merged).toEqual({
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	});
	expect(changed).toBe(false); // No change
});

test("merge returns changed=false when obj2 only has older values", () => {
	const obj1: EncodedObject = {
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-03T00:00:00Z",
		},
		age: {
			__value: 30,
			__eventstamp: "2024-01-03T00:00:00Z",
		},
	};
	const obj2: EncodedObject = {
		name: {
			__value: "Bob",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
		age: {
			__value: 25,
			__eventstamp: "2024-01-02T00:00:00Z",
		},
	};

	const [merged, changed] = merge(obj1, obj2);

	expect(merged).toEqual({
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-03T00:00:00Z",
		},
		age: {
			__value: 30,
			__eventstamp: "2024-01-03T00:00:00Z",
		},
	});
	expect(changed).toBe(false); // All obj1 values kept
});

test("mergeArray combines two arrays with different keys", () => {
	const current = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];
	const updates = [
		{
			key: "user2",
			value: {
				name: {
					__value: "Bob",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];

	const [merged, changed] = mergeArray(current, updates);

	expect(merged).toContainEqual({
		key: "user1",
		value: {
			name: {
				__value: "Alice",
				__eventstamp: "2024-01-01T00:00:00Z",
			},
		},
	});
	expect(merged).toContainEqual({
		key: "user2",
		value: {
			name: {
				__value: "Bob",
				__eventstamp: "2024-01-01T00:00:00Z",
			},
		},
	});
	expect(changed).toBe(true); // New record added
});

test("mergeArray merges objects with same key based on eventstamp", () => {
	const current = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
				age: {
					__value: 25,
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];
	const updates = [
		{
			key: "user1",
			value: {
				age: {
					__value: 30,
					__eventstamp: "2024-01-02T00:00:00Z",
				},
				city: {
					__value: "NYC",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];

	const [merged, changed] = mergeArray(current, updates);

	expect(merged).toHaveLength(1);
	expect(merged[0]?.key).toBe("user1");
	expect(merged[0]?.value).toEqual({
		name: {
			__value: "Alice",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
		age: {
			__value: 30,
			__eventstamp: "2024-01-02T00:00:00Z",
		},
		city: {
			__value: "NYC",
			__eventstamp: "2024-01-01T00:00:00Z",
		},
	});
	expect(changed).toBe(true); // age was updated and city was added
});

test("mergeArray returns changed=false when arrays are identical", () => {
	const current = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];
	const updates = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];

	const [merged, changed] = mergeArray(current, updates);

	expect(merged).toHaveLength(1);
	expect(merged[0]?.key).toBe("user1");
	expect(changed).toBe(false); // No change
});

test("mergeArray handles multiple arrays with mixed changes", () => {
	const current = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2024-01-03T00:00:00Z",
				},
			} as EncodedObject,
		},
		{
			key: "user2",
			value: {
				name: {
					__value: "Bob",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];
	const updates = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice Updated",
					__eventstamp: "2024-01-02T00:00:00Z",
				},
			} as EncodedObject,
		},
		{
			key: "user3",
			value: {
				name: {
					__value: "Charlie",
					__eventstamp: "2024-01-01T00:00:00Z",
				},
			} as EncodedObject,
		},
	];

	const [merged, changed] = mergeArray(current, updates);

	expect(merged).toHaveLength(3);
	const mergedMap = new Map(merged.map((item) => [item.key, item.value]));

	expect(mergedMap.get("user1")?.name?.__value).toBe("Alice"); // Kept newer timestamp
	expect(mergedMap.get("user2")?.name?.__value).toBe("Bob");
	expect(mergedMap.get("user3")?.name?.__value).toBe("Charlie");
	expect(changed).toBe(true); // user3 was added
});
