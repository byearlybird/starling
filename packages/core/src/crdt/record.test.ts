import { expect, test } from "bun:test";
import { decodeRecord, encodeRecord, mergeRecords, processRecord } from ".";

test("encode wraps all leaf values with eventstamp using mirrored structure", () => {
	const obj = { name: "Alice", age: 30 };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);

	// Check the mirrored structure
	expect(encoded["~data"]).toEqual({ name: "Alice", age: 30 });
	expect(encoded["~eventstamps"]).toEqual({ name: eventstamp, age: eventstamp });
});

test("decode extracts all values from encoded object", () => {
	const original = { name: "Alice", age: 30, active: true };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(original, eventstamp);
	const decoded = decodeRecord(encoded);

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
	expect(encoded["~data"]).toEqual({
		user: {
			name: "Bob",
			email: "bob@example.com",
		},
	});
	expect(encoded["~eventstamps"]).toEqual({
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
	const decoded = decodeRecord(encoded);

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
	const decoded = decodeRecord(encoded);

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
	const decoded = decodeRecord(encoded);

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
	const decoded = decodeRecord(encoded);

	expect(decoded).toEqual({ ownProp: "value", defined: "should be included" });
});

test("encode handles empty objects", () => {
	const obj = {};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = decodeRecord(encoded);

	expect(decoded).toEqual({});
});

test("encode handles objects with empty nested objects", () => {
	const obj = { nested: {} };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = decodeRecord(encoded);

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
	const decoded = decodeRecord(encoded);

	expect(decoded).toEqual(obj);
	expect(decoded.tags).toEqual(["admin", "user", "moderator"]);
	expect(decoded.scores).toEqual([95, 87, 92]);
});

test("processRecord applies processor to every encoded value", () => {
	const obj = {
		name: "Alice",
		active: true,
		stats: { level: 3, title: "captain" },
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord(obj, eventstamp);

	const seen: unknown[] = [];
	const processed = processRecord(encoded, (value, stamp) => {
		seen.push(value);
		return {
			value,
			eventstamp: `${stamp}-processed`,
		};
	});

	expect(seen).toHaveLength(4);
	expect(seen).toEqual(expect.arrayContaining(["Alice", true, 3, "captain"]));

	// Check the processed mirrored structure
	const eventstamps = processed["~eventstamps"] as Record<string, unknown>;
	expect(eventstamps.name).toBe(`${eventstamp}-processed`);
	expect(eventstamps.active).toBe(`${eventstamp}-processed`);

	const stats = eventstamps.stats as Record<string, string>;
	expect(stats.level).toBe(`${eventstamp}-processed`);
	expect(stats.title).toBe(`${eventstamp}-processed`);
});

test("processRecord returns a new encoded record without mutating source", () => {
	const eventstamp = "2025-10-25T12:00:00.000Z|0001|a1b2";
	const encoded = encodeRecord({ user: { name: "Eve" } }, eventstamp);
	const snapshot = JSON.parse(JSON.stringify(encoded));

	const processed = processRecord(encoded, (value, stamp) => ({
		value,
		eventstamp: "processed-stamp",
	}));

	expect(encoded).toEqual(snapshot);
	expect(processed).not.toBe(encoded);

	// Check that the structure was not mutated
	expect(processed["~data"]).not.toBe(encoded["~data"]);
	expect(processed["~eventstamps"]).not.toBe(encoded["~eventstamps"]);

	// Check the processed values
	const processedData = processed["~data"] as Record<string, Record<string, unknown>>;
	const processedStamps = processed["~eventstamps"] as Record<string, Record<string, string>>;

	expect(processedData.user.name).toBe("Eve");
	expect(processedStamps.user.name).toBe("processed-stamp");
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

	const [merged, eventstamp] = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	expect(decoded.name).toBe("Bob");
	expect(decoded.age).toBe(25);
	expect(eventstamp).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
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

	const [merged, eventstamp] = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	expect(decoded.status).toBe("active");
	expect(eventstamp).toBe("2025-10-25T12:00:05.000Z|0001|e5f6");
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

	const [merged, eventstamp] = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	expect(decoded).toEqual({
		name: "Alice",
		age: 30,
		email: "alice@example.com",
	});
	expect(eventstamp).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
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

	const [merged, eventstamp] = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged) as Record<string, unknown>;

	const user = decoded.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");
	expect(eventstamp).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
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

	const [merged, eventstamp] = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged) as Record<string, unknown>;

	const a = decoded.a as Record<string, unknown>;
	const b = a.b as Record<string, unknown>;
	expect(b.c).toBe("v2");
	expect(b.d).toBe("from-v1");
	expect(eventstamp).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
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

	const [, eventstamp] = mergeRecords(v1, v2);

	// The newest eventstamp from the entire merge should bubble up
	expect(eventstamp).toBe("2025-10-25T12:00:05.000Z|9999|g7h8");
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

	const [merged, eventstamp] = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	// The newest eventstamp should bubble up even though only one field changed
	expect(eventstamp).toBe("2025-10-25T12:00:10.000Z|0001|i9j0");
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

	const [, eventstamp] = mergeRecords(v1, v2);

	// The newest eventstamp from the deepest level should bubble all the way up
	expect(eventstamp).toBe("2025-10-25T12:00:20.000Z|0001|k1l2");
});
