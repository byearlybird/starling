import { expect, test } from "bun:test";
import { encodeRecord, mergeRecords } from ".";

test("encode wraps all leaf values with eventstamp using mirrored structure", () => {
	const obj = { name: "Alice", age: 30 };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);

	// Check the mirrored structure
	expect(encoded.data).toEqual({ name: "Alice", age: 30 });
	expect(encoded.meta.eventstamps).toEqual({ name: eventstamp, age: eventstamp });
});

test("decode extracts all values from encoded object", () => {
	const original = { name: "Alice", age: 30, active: true };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(original, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual(original);
});

test("encode handles nested objects recursively", () => {
	const obj = {
		user: {
			name: "Bob",
			email: "bob@example.com",
		},
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);

	// Check the mirrored structure for nested objects
	expect(encoded.data).toEqual({
		user: {
			name: "Bob",
			email: "bob@example.com",
		},
	});
	expect(encoded.meta.eventstamps).toEqual({
		user: {
			name: eventstamp,
			email: eventstamp,
		},
	});
});

test("decode handles nested objects recursively", () => {
	const original = {
		user: {
			name: "Charlie",
			profile: {
				bio: "Developer",
			},
		},
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(original, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual(original);
});

test("encode handles deeply nested structures", () => {
	const obj = {
		a: {
			b: {
				c: {
					value: "deep",
				},
			},
		},
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = encoded.data;

	console.log("serialized", JSON.stringify(obj));
	expect(decoded).toEqual(obj);
});

test("encode handles mixed primitive types", () => {
	const obj = {
		string: "text",
		number: 42,
		boolean: true,
		null: null,
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual(obj);
});

test("encode includes all enumerable own properties", () => {
	const obj: Record<string, unknown> = { ownProp: "value" };
	Object.defineProperty(obj, "defined", {
		value: "should be included",
		enumerable: true,
	});

	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual({ ownProp: "value", defined: "should be included" });
});

test("encode handles empty objects", () => {
	const obj = {};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual({});
});

test("encode handles objects with empty nested objects", () => {
	const obj = { nested: {} };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual({ nested: {} });
});

test("encode preserves array values as leaf values", () => {
	const obj = {
		name: "Alice",
		tags: ["admin", "user", "moderator"],
		scores: [95, 87, 92],
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = encoded.data;

	expect(decoded).toEqual(obj);
	expect(decoded.tags).toEqual(["admin", "user", "moderator"]);
	expect(decoded.scores).toEqual([95, 87, 92]);
});

test("merge keeps newer value based on eventstamp", () => {
	const v1 = encodeRecord(
		{ name: "Alice", age: 30 },
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{ name: "Bob", age: 25 },
		"2025-10-25T12:00:01.000Z|0001|c3d4",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = merged.data;

	expect(decoded.name).toBe("Bob");
	expect(decoded.age).toBe(25);
	expect(merged.meta.latest).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
});

test("merge keeps older value when it has newer eventstamp", () => {
	const v1 = encodeRecord(
		{ status: "active" },
		"2025-10-25T12:00:05.000Z|0001|e5f6",
	);
	const v2 = encodeRecord(
		{ status: "inactive" },
		"2025-10-25T12:00:01.000Z|0001|c3d4",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = merged.data;

	expect(decoded.status).toBe("active");
	expect(merged.meta.latest).toBe("2025-10-25T12:00:05.000Z|0001|e5f6");
});

test("merge combines keys from both objects", () => {
	const v1 = encodeRecord(
		{ name: "Alice", age: 30 },
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{ email: "alice@example.com" },
		"2025-10-25T12:00:01.000Z|0001|c3d4",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = merged.data;

	expect(decoded).toEqual({
		name: "Alice",
		age: 30,
		email: "alice@example.com",
	});
	expect(merged.meta.latest).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
});

test("merge handles nested objects", () => {
	const v1 = encodeRecord(
		{ user: { name: "Alice", age: 30 } },
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-10-25T12:00:01.000Z|0001|c3d4",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = merged.data as Record<string, unknown>;

	const user = decoded.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");
	expect(merged.meta.latest).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
});

test("merge preserves deeply nested structures", () => {
	const v1 = encodeRecord(
		{ a: { b: { c: "v1", d: "from-v1" } } },
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{ a: { b: { c: "v2" } } },
		"2025-10-25T12:00:01.000Z|0001|c3d4",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = merged.data as Record<string, unknown>;

	const a = decoded.a as Record<string, unknown>;
	const b = a.b as Record<string, unknown>;
	expect(b.c).toBe("v2");
	expect(b.d).toBe("from-v1");
	expect(merged.meta.latest).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
});

test("merge bubbles newest eventstamp from any nested field", () => {
	const v1 = encodeRecord(
		{ user: { name: "Alice", score: 100 } },
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-10-25T12:00:05.000Z|9999|g7h8", // much newer
	);

	const merged = mergeRecords(v1, v2);

	// The newest eventstamp from the entire merge should bubble up
	expect(merged.meta.latest).toBe("2025-10-25T12:00:05.000Z|9999|g7h8");
});

test("merge bubbles newest eventstamp even when only one field is newer", () => {
	const v1 = encodeRecord(
		{ a: "value-a", b: "value-b", c: "value-c" },
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{ a: "new-a" },
		"2025-10-25T12:00:10.000Z|0001|i9j0", // Only a updates, but with newest timestamp
	);

	const merged = mergeRecords(v1, v2);
	const decoded = merged.data;

	// The newest eventstamp should bubble up even though only one field changed
	expect(merged.meta.latest).toBe("2025-10-25T12:00:10.000Z|0001|i9j0");
	expect(decoded.a).toBe("new-a");
	expect(decoded.b).toBe("value-b");
	expect(decoded.c).toBe("value-c");
});

test("merge bubbles newest eventstamp through deeply nested structures", () => {
	const v1 = encodeRecord(
		{
			level1: {
				level2: {
					level3: {
						value: "old",
					},
				},
			},
		},
		"2025-10-25T12:00:00.000Z|0001|a1b2",
	);
	const v2 = encodeRecord(
		{
			level1: {
				level2: {
					level3: {
						value: "new",
					},
				},
			},
		},
		"2025-10-25T12:00:20.000Z|0001|k1l2", // Much newer
	);

	const merged = mergeRecords(v1, v2);

	// The newest eventstamp from the deepest level should bubble all the way up
	expect(merged.meta.latest).toBe("2025-10-25T12:00:20.000Z|0001|k1l2");
});
