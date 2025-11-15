import { expect, test } from "bun:test";
import { mergeAttributes } from ".";

test("mergeAttributes merges plain attributes with separate eventstamps", () => {
	const attrsA = { name: "Alice", age: 30 };
	const eventsA = {
		name: "2025-10-25T12:00:00.000Z|0001|a1b2",
		age: "2025-10-25T12:00:00.000Z|0001|a1b2",
	};

	const attrsB = { name: "Bob", age: 25 };
	const eventsB = {
		name: "2025-10-25T12:00:01.000Z|0001|c3d4",
		age: "2025-10-25T12:00:01.000Z|0001|c3d4",
	};

	const [merged, mergedEvents] = mergeAttributes(
		attrsA,
		eventsA,
		attrsB,
		eventsB,
	);

	expect(merged.name).toBe("Bob");
	expect(merged.age).toBe(25); // B's age has newer eventstamp
	expect(mergedEvents.name).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
	expect(mergedEvents.age).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
});

test("mergeAttributes preserves values from A when A has newer eventstamp", () => {
	const attrsA = { status: "active" };
	const eventsA = { status: "2025-10-25T12:00:05.000Z|0001|e5f6" };

	const attrsB = { status: "inactive" };
	const eventsB = { status: "2025-10-25T12:00:01.000Z|0001|c3d4" };

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	expect(merged.status).toBe("active");
});

test("mergeAttributes combines keys from both objects", () => {
	const attrsA = { name: "Alice", age: 30 };
	const eventsA = {
		name: "2025-10-25T12:00:00.000Z|0001|a1b2",
		age: "2025-10-25T12:00:00.000Z|0001|a1b2",
	};

	const attrsB = { email: "alice@example.com" };
	const eventsB = { email: "2025-10-25T12:00:01.000Z|0001|c3d4" };

	const [merged, mergedEvents] = mergeAttributes(
		attrsA,
		eventsA,
		attrsB,
		eventsB,
	);

	expect(merged).toEqual({
		name: "Alice",
		age: 30,
		email: "alice@example.com",
	});
	expect(mergedEvents.email).toBe("2025-10-25T12:00:01.000Z|0001|c3d4");
});

test("mergeAttributes handles nested objects", () => {
	const attrsA = { user: { name: "Alice", age: 30 } };
	const eventsA = {
		user: {
			name: "2025-10-25T12:00:00.000Z|0001|a1b2",
			age: "2025-10-25T12:00:00.000Z|0001|a1b2",
		},
	};

	const attrsB = { user: { name: "Bob", email: "bob@example.com" } };
	const eventsB = {
		user: {
			name: "2025-10-25T12:00:01.000Z|0001|c3d4",
			email: "2025-10-25T12:00:01.000Z|0001|c3d4",
		},
	};

	const [merged, _mergedEvents] = mergeAttributes(
		attrsA,
		eventsA,
		attrsB,
		eventsB,
	);

	expect((merged.user as Record<string, unknown>).name).toBe("Bob");
	expect((merged.user as Record<string, unknown>).age).toBe(30);
	expect((merged.user as Record<string, unknown>).email).toBe(
		"bob@example.com",
	);
});

test("mergeAttributes preserves deeply nested structures", () => {
	const attrsA = { a: { b: { c: "v1", d: "from-a" } } };
	const eventsA = {
		a: {
			b: {
				c: "2025-10-25T12:00:00.000Z|0001|a1b2",
				d: "2025-10-25T12:00:00.000Z|0001|a1b2",
			},
		},
	};

	const attrsB = { a: { b: { c: "v2" } } };
	const eventsB = { a: { b: { c: "2025-10-25T12:00:01.000Z|0001|c3d4" } } };

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	const a = merged.a as Record<string, unknown>;
	const b = a.b as Record<string, unknown>;
	expect(b.c).toBe("v2");
	expect(b.d).toBe("from-a");
});

test("mergeAttributes throws error if attributes is object but eventstamps is leaf", () => {
	const attrsA = { user: { name: "Alice" } };
	const eventsA = { user: "2025-10-25T12:00:00.000Z|0001|a1b2" }; // Wrong: should mirror structure

	const attrsB = { user: {} };
	const eventsB = { user: {} };

	expect(() => mergeAttributes(attrsA, eventsA, attrsB, eventsB)).toThrow(
		/Structure mismatch at "user"/,
	);
});

test("mergeAttributes throws error if attributes is leaf but eventstamps is object", () => {
	const attrsA = { field: "value" };
	const eventsA = { field: { nested: "object" } }; // Wrong: should be a string

	const attrsB = { field: "other" };
	const eventsB = { field: "2025-10-25T12:00:00.000Z|0001|a1b2" };

	expect(() => mergeAttributes(attrsA, eventsA, attrsB, eventsB)).toThrow(
		/Structure mismatch at "field"/,
	);
});

test("mergeAttributes throws error if source changes field from object to leaf", () => {
	const attrsA = { profile: { name: "Alice" } };
	const eventsA = { profile: { name: "2025-10-25T12:00:00.000Z|0001|a1b2" } };

	const attrsB = { profile: "alice" };
	const eventsB = { profile: "2025-10-25T12:00:01.000Z|0001|c3d4" };

	expect(() => mergeAttributes(attrsA, eventsA, attrsB, eventsB)).toThrow(
		/Type mismatch at "profile"/,
	);
});

test("mergeAttributes throws error if source changes field from leaf to object", () => {
	const attrsA = { profile: "alice" };
	const eventsA = { profile: "2025-10-25T12:00:00.000Z|0001|a1b2" };

	const attrsB = { profile: { name: "Alice" } };
	const eventsB = { profile: { name: "2025-10-25T12:00:01.000Z|0001|c3d4" } };

	expect(() => mergeAttributes(attrsA, eventsA, attrsB, eventsB)).toThrow(
		/Type mismatch at "profile"/,
	);
});

test("mergeAttributes throws error with full path for deeply nested mismatch", () => {
	const attrsA = { level1: { level2: { level3: { value: "data" } } } };
	const eventsA = {
		level1: { level2: { level3: "2025-10-25T12:00:00.000Z|0001|a1b2" } },
	}; // Wrong at level3

	const attrsB = { level1: { level2: { level3: { value: "other" } } } };
	const eventsB = {
		level1: {
			level2: { level3: { value: "2025-10-25T12:00:00.000Z|0001|a1b2" } },
		},
	};

	expect(() => mergeAttributes(attrsA, eventsA, attrsB, eventsB)).toThrow(
		/Structure mismatch at "level1.level2.level3"/,
	);
});

test("mergeAttributes handles empty objects", () => {
	const attrsA = {};
	const eventsA = {};

	const attrsB = {};
	const eventsB = {};

	const [merged, mergedEvents] = mergeAttributes(
		attrsA,
		eventsA,
		attrsB,
		eventsB,
	);

	expect(merged).toEqual({});
	expect(mergedEvents).toEqual({});
});

test("mergeAttributes handles objects with empty nested objects", () => {
	const attrsA = { nested: {} };
	const eventsA = { nested: {} };

	const attrsB = { nested: {} };
	const eventsB = { nested: {} };

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	expect(merged.nested as Record<string, unknown>).toEqual({});
});

test("mergeAttributes preserves array values as leaf values", () => {
	const attrsA = { name: "Alice", tags: ["admin", "user"] };
	const eventsA = {
		name: "2025-10-25T12:00:00.000Z|0001|a1b2",
		tags: "2025-10-25T12:00:00.000Z|0001|a1b2",
	};

	const attrsB = { tags: ["moderator", "guest"] };
	const eventsB = { tags: "2025-10-25T12:00:01.000Z|0001|c3d4" };

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	expect(merged.tags).toEqual(["moderator", "guest"]); // B wins due to newer eventstamp
});

test("mergeAttributes uses lexicographic comparison for eventstamps", () => {
	const attrsA = { value: "A" };
	const eventsA = { value: "2025-10-25T11:59:00.000Z|9999|zzzz" }; // Technically "earlier" conceptually but lexicographically smaller

	const attrsB = { value: "B" };
	const eventsB = { value: "2025-10-25T12:00:00.000Z|0000|0000" }; // Lexicographically larger

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	expect(merged.value).toBe("B"); // B wins because its eventstamp is lexicographically larger
});
