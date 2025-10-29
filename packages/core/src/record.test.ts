import { expect, test } from "bun:test";
import {
	decodeRecord,
	encodeRecord,
	mergeRecords,
	processRecord,
} from "./record.ts";

test("encode wraps all leaf values with eventstamp", () => {
	const obj = { name: "Alice", age: 30 };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeRecord(obj, eventstamp);

	const name = encoded.name as { "~value": unknown; "~eventstamp": string };
	const age = encoded.age as { "~value": unknown; "~eventstamp": string };

	expect(name["~value"]).toBe("Alice");
	expect(name["~eventstamp"]).toBe(eventstamp);
	expect(age["~value"]).toBe(30);
	expect(age["~eventstamp"]).toBe(eventstamp);
});

test("decode extracts all values from encoded object", () => {
	const original = { name: "Alice", age: 30, active: true };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
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
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeRecord(obj, eventstamp);

	expect(encoded.user).toEqual({
		name: { "~value": "Bob", "~eventstamp": eventstamp },
		email: { "~value": "bob@example.com", "~eventstamp": eventstamp },
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
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
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
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
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
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
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

	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = decodeRecord(encoded);

	expect(decoded).toEqual({ ownProp: "value", defined: "should be included" });
});

test("encode handles empty objects", () => {
	const obj = {};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeRecord(obj, eventstamp);
	const decoded = decodeRecord(encoded);

	expect(decoded).toEqual({});
});

test("encode handles objects with empty nested objects", () => {
	const obj = { nested: {} };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
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
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
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
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeRecord(obj, eventstamp);

	const seen: unknown[] = [];
	const processed = processRecord(encoded, (value) => {
		seen.push(value["~value"]);
		return {
			...value,
			"~eventstamp": `${value["~eventstamp"]}-processed`,
		};
	});

	expect(seen).toHaveLength(4);
	expect(seen).toEqual(expect.arrayContaining(["Alice", true, 3, "captain"]));

	const processedName = processed.name as Record<string, string>;
	expect(processedName["~eventstamp"]).toBe(`${eventstamp}-processed`);

	const processedActive = processed.active as Record<string, string>;
	expect(processedActive["~eventstamp"]).toBe(`${eventstamp}-processed`);

	const stats = processed.stats as Record<string, unknown>;
	const level = stats.level as Record<string, string>;
	const title = stats.title as Record<string, string>;
	expect(level["~eventstamp"]).toBe(`${eventstamp}-processed`);
	expect(title["~eventstamp"]).toBe(`${eventstamp}-processed`);
});

test("processRecord returns a new encoded record without mutating source", () => {
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encodeRecord({ user: { name: "Eve" } }, eventstamp);
	const snapshot = JSON.parse(JSON.stringify(encoded));

	const processed = processRecord(encoded, (value) => ({
		...value,
		"~eventstamp": "processed-stamp",
	}));

	expect(encoded).toEqual(snapshot);
	expect(processed).not.toBe(encoded);

	const processedUser = processed.user as Record<string, unknown>;
	const originalUser = encoded.user as Record<string, unknown>;

	expect(processedUser).not.toBe(originalUser);
	expect(processedUser.name).toEqual({
		"~value": "Eve",
		"~eventstamp": "processed-stamp",
	});
});

test("merge keeps newer value based on eventstamp", () => {
	const v1 = encodeRecord(
		{ name: "Alice", age: 30 },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encodeRecord(
		{ name: "Bob", age: 25 },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	expect(decoded.name).toBe("Bob");
	expect(decoded.age).toBe(25);
});

test("merge keeps older value when it has newer eventstamp", () => {
	const v1 = encodeRecord(
		{ status: "active" },
		"2025-10-25T12:00:05.000Z|0001",
	);
	const v2 = encodeRecord(
		{ status: "inactive" },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	expect(decoded.status).toBe("active");
});

test("merge combines keys from both objects", () => {
	const v1 = encodeRecord(
		{ name: "Alice", age: 30 },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encodeRecord(
		{ email: "alice@example.com" },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged);

	expect(decoded).toEqual({
		name: "Alice",
		age: 30,
		email: "alice@example.com",
	});
});

test("merge handles nested objects", () => {
	const v1 = encodeRecord(
		{ user: { name: "Alice", age: 30 } },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encodeRecord(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged) as Record<string, unknown>;

	const user = decoded.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");
});

test("merge preserves deeply nested structures", () => {
	const v1 = encodeRecord(
		{ a: { b: { c: "v1", d: "from-v1" } } },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encodeRecord(
		{ a: { b: { c: "v2" } } },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = mergeRecords(v1, v2);
	const decoded = decodeRecord(merged) as Record<string, unknown>;

	const a = decoded.a as Record<string, unknown>;
	const b = a.b as Record<string, unknown>;
	expect(b.c).toBe("v2");
	expect(b.d).toBe("from-v1");
});
