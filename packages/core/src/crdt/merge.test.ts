import { expect, test } from "bun:test";
import { mergeAttributes } from ".";
import { EARLIER, LATER, LATEST } from "./test-utils";

test("mergeAttributes uses field-level Last-Write-Wins", () => {
	const attrsA = { name: "Alice", age: 30, status: "active" };
	const eventsA = { name: EARLIER, age: EARLIER, status: LATEST };

	const attrsB = { name: "Bob", age: 25, status: "inactive" };
	const eventsB = { name: LATER, age: LATER, status: EARLIER };

	const [merged, mergedEvents] = mergeAttributes(
		attrsA,
		eventsA,
		attrsB,
		eventsB,
	);

	expect(merged.name).toBe("Bob");
	expect(merged.age).toBe(25);
	expect(merged.status).toBe("active");
	expect(mergedEvents.name).toBe(LATER);
	expect(mergedEvents.age).toBe(LATER);
	expect(mergedEvents.status).toBe(LATEST);
});

test("mergeAttributes combines keys from both objects", () => {
	const attrsA = { name: "Alice", age: 30 };
	const eventsA = { name: EARLIER, age: EARLIER };

	const attrsB = { email: "alice@example.com" };
	const eventsB = { email: LATER };

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
	expect(mergedEvents.email).toBe(LATER);
});

test("mergeAttributes handles nested objects", () => {
	const attrsA = { user: { name: "Alice", age: 30 }, nested: { a: { b: 1 } } };
	const eventsA = {
		user: { name: EARLIER, age: EARLIER },
		nested: { a: { b: EARLIER } },
	};

	const attrsB = {
		user: { name: "Bob", email: "bob@example.com" },
		nested: { a: { b: 2, c: 3 } },
	};
	const eventsB = {
		user: { name: LATER, email: LATER },
		nested: { a: { b: LATER, c: LATER } },
	};

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	const user = merged.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");

	const nested = merged.nested as Record<string, unknown>;
	const a = nested.a as Record<string, unknown>;
	expect(a.b).toBe(2);
	expect(a.c).toBe(3);
});

test.each([
	[
		"structure mismatch: object attrs vs leaf eventstamps",
		{ user: { name: "Alice" } },
		{ user: EARLIER },
		{ user: {} },
		{ user: {} },
		/Structure mismatch at "user"/,
	],
	[
		"structure mismatch: leaf attrs vs object eventstamps",
		{ field: "value" },
		{ field: { nested: "object" } },
		{ field: "other" },
		{ field: EARLIER },
		/Structure mismatch at "field"/,
	],
	[
		"type mismatch: object to leaf",
		{ profile: { name: "Alice" } },
		{ profile: { name: EARLIER } },
		{ profile: "alice" },
		{ profile: LATER },
		/Type mismatch at "profile"/,
	],
	[
		"type mismatch: leaf to object",
		{ profile: "alice" },
		{ profile: EARLIER },
		{ profile: { name: "Alice" } },
		{ profile: { name: LATER } },
		/Type mismatch at "profile"/,
	],
])(
	"mergeAttributes throws error for %s",
	(_desc, attrsA, eventsA, attrsB, eventsB, errorPattern) => {
		expect(() => mergeAttributes(attrsA, eventsA, attrsB, eventsB)).toThrow(
			errorPattern,
		);
	},
);

test("mergeAttributes handles empty objects", () => {
	const [merged, mergedEvents] = mergeAttributes({}, {}, {}, {});

	expect(merged).toEqual({});
	expect(mergedEvents).toEqual({});
});

test("mergeAttributes treats arrays as atomic values", () => {
	const attrsA = { tags: ["admin", "user"] };
	const eventsA = { tags: EARLIER };

	const attrsB = { tags: ["moderator", "guest"] };
	const eventsB = { tags: LATER };

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	expect(merged.tags).toEqual(["moderator", "guest"]);
});

test("mergeAttributes uses lexicographic comparison", () => {
	const attrsA = { value: "A" };
	const eventsA = { value: "2025-10-25T11:59:00.000Z|9999|zzzz" };

	const attrsB = { value: "B" };
	const eventsB = { value: "2025-10-25T12:00:00.000Z|0000|0000" };

	const [merged] = mergeAttributes(attrsA, eventsA, attrsB, eventsB);

	expect(merged.value).toBe("B");
});
