import { expect, test } from "bun:test";
import { decode, encode, merge } from "./obj.ts";

test("encode wraps all leaf values with eventstamp", () => {
	const obj = { name: "Alice", age: 30 };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(obj, eventstamp);

	const name = encoded.name as { __value: unknown; __eventstamp: string };
	const age = encoded.age as { __value: unknown; __eventstamp: string };

	expect(name.__value).toBe("Alice");
	expect(name.__eventstamp).toBe(eventstamp);
	expect(age.__value).toBe(30);
	expect(age.__eventstamp).toBe(eventstamp);
});

test("decode extracts all values from encoded object", () => {
	const original = { name: "Alice", age: 30, active: true };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(original, eventstamp);
	const decoded = decode(encoded);

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
	const encoded = encode(obj, eventstamp);

	expect(encoded.user).toEqual({
		name: { __value: "Bob", __eventstamp: eventstamp },
		email: { __value: "bob@example.com", __eventstamp: eventstamp },
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
	const encoded = encode(original, eventstamp);
	const decoded = decode(encoded);

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
	const encoded = encode(obj, eventstamp);
	const decoded = decode(encoded);

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
	const encoded = encode(obj, eventstamp);
	const decoded = decode(encoded);

	expect(decoded).toEqual(obj);
});

test("encode includes all enumerable own properties", () => {
	const obj: Record<string, unknown> = { ownProp: "value" };
	Object.defineProperty(obj, "defined", {
		value: "should be included",
		enumerable: true,
	});

	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(obj, eventstamp);
	const decoded = decode(encoded);

	expect(decoded).toEqual({ ownProp: "value", defined: "should be included" });
});

test("encode handles empty objects", () => {
	const obj = {};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(obj, eventstamp);
	const decoded = decode(encoded);

	expect(decoded).toEqual({});
});

test("encode handles objects with empty nested objects", () => {
	const obj = { nested: {} };
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(obj, eventstamp);
	const decoded = decode(encoded);

	expect(decoded).toEqual({ nested: {} });
});

test("encode preserves array values as leaf values", () => {
	const obj = {
		name: "Alice",
		tags: ["admin", "user", "moderator"],
		scores: [95, 87, 92],
	};
	const eventstamp = "2025-10-25T12:00:00.000Z|0001";
	const encoded = encode(obj, eventstamp);
	const decoded = decode(encoded);

	expect(decoded).toEqual(obj);
	expect(decoded.tags).toEqual(["admin", "user", "moderator"]);
	expect(decoded.scores).toEqual([95, 87, 92]);
});

test("merge keeps newer value based on eventstamp", () => {
	const v1 = encode(
		{ name: "Alice", age: 30 },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encode({ name: "Bob", age: 25 }, "2025-10-25T12:00:01.000Z|0001");

	const merged = merge(v1, v2);
	const decoded = decode(merged);

	expect(decoded.name).toBe("Bob");
	expect(decoded.age).toBe(25);
});

test("merge keeps older value when it has newer eventstamp", () => {
	const v1 = encode({ status: "active" }, "2025-10-25T12:00:05.000Z|0001");
	const v2 = encode({ status: "inactive" }, "2025-10-25T12:00:01.000Z|0001");

	const merged = merge(v1, v2);
	const decoded = decode(merged);

	expect(decoded.status).toBe("active");
});

test("merge combines keys from both objects", () => {
	const v1 = encode(
		{ name: "Alice", age: 30 },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encode(
		{ email: "alice@example.com" },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = merge(v1, v2);
	const decoded = decode(merged);

	expect(decoded).toEqual({
		name: "Alice",
		age: 30,
		email: "alice@example.com",
	});
});

test("merge handles nested objects", () => {
	const v1 = encode(
		{ user: { name: "Alice", age: 30 } },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encode(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-10-25T12:00:01.000Z|0001",
	);

	const merged = merge(v1, v2);
	const decoded = decode(merged) as Record<string, unknown>;

	const user = decoded.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");
});

test("merge preserves deeply nested structures", () => {
	const v1 = encode(
		{ a: { b: { c: "v1", d: "from-v1" } } },
		"2025-10-25T12:00:00.000Z|0001",
	);
	const v2 = encode({ a: { b: { c: "v2" } } }, "2025-10-25T12:00:01.000Z|0001");

	const merged = merge(v1, v2);
	const decoded = decode(merged) as Record<string, unknown>;

	const a = decoded.a as Record<string, unknown>;
	const b = a.b as Record<string, unknown>;
	expect(b.c).toBe("v2");
	expect(b.d).toBe("from-v1");
});
