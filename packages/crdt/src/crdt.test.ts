import { expect, test } from "bun:test";
import { EncodedMap, EncodedObject, EncodedValue } from "./crdt.ts";

test("EncodedValue serializes with value, eventstamp, and deleted flag", () => {
	const value = new EncodedValue("test", "2024-01-01T00:00:00Z", false);
	const serialized = value.serialize();

	expect(serialized).toEqual(["test", "2024-01-01T00:00:00Z", 0]);
});

test("EncodedValue serializes deleted state", () => {
	const value = new EncodedValue("test", "2024-01-01T00:00:00Z", true);
	const serialized = value.serialize();

	expect(serialized).toEqual(["test", "2024-01-01T00:00:00Z", 1]);
});

test("EncodedValue deserializes from tuple format", () => {
	const serialized: [string, string, number] = [
		"test",
		"2024-01-01T00:00:00Z",
		0,
	];
	const value = EncodedValue.deserialize(serialized);

	expect(value.getValue()).toBe("test");
	expect(value.getEventstamp()).toBe("2024-01-01T00:00:00Z");
	expect(value.isDeleted()).toBe(false);
});

test("EncodedValue.delete() marks value as deleted", () => {
	const value = new EncodedValue("test", "2024-01-01T00:00:00Z", false);
	expect(value.isDeleted()).toBe(false);

	value.delete();
	expect(value.isDeleted()).toBe(true);
});

test("EncodedObject.encode converts a flat object to encoded format", () => {
	const obj = { name: "Alice", age: 30 };
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = EncodedObject.encode(obj, eventstamp);
	const decoded = encoded.decode<typeof obj>();

	expect(decoded).toEqual(obj);
});

test("EncodedObject.encode converts a nested object to encoded format", () => {
	const obj = {
		user: {
			name: "Bob",
			profile: {
				age: 25,
			},
		},
	};
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = EncodedObject.encode(obj, eventstamp);
	const decoded = encoded.decode<typeof obj>();

	expect(decoded).toEqual(obj);
});

test("EncodedObject.decode converts encoded object back to original format", () => {
	const obj = {
		name: "Charlie",
		age: 35,
	};
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = EncodedObject.encode(obj, eventstamp);
	const decoded = encoded.decode<typeof obj>();

	expect(decoded).toEqual(obj);
});

test("EncodedObject encode then decode round-trip preserves data", () => {
	const original = {
		id: 123,
		title: "Test",
		metadata: {
			author: "Eve",
			tags: ["test", "example"],
		},
	};
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded = EncodedObject.encode(original, eventstamp);

	const decoded = encoded.decode<typeof original>();

	expect(decoded).toEqual(original);
});

test("EncodedObject.merge combines two objects and returns changed status", () => {
	const obj1 = { name: "Alice" };
	const obj2 = { age: 30 };
	const eventstamp = "2024-01-01T00:00:00Z";

	const encoded1 = EncodedObject.encode(obj1, eventstamp);
	const encoded2 = EncodedObject.encode(obj2, eventstamp);

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(true); // New property added
	const result = encoded1.decode<{ name: string; age: number }>();
	expect(result).toEqual({ name: "Alice", age: 30 });
});

test("EncodedObject.merge prefers newer eventstamp when properties conflict", () => {
	const obj1 = { name: "Alice" };
	const obj2 = { name: "Bob" };

	const encoded1 = EncodedObject.encode(obj1, "2024-01-01T00:00:00Z");
	const encoded2 = EncodedObject.encode(obj2, "2024-01-02T00:00:00Z");

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(true); // obj2 had newer value
	const result = encoded1.decode<{ name: string }>();
	expect(result.name).toBe("Bob");
});

test("EncodedObject.merge prefers older value when first eventstamp is newer", () => {
	const obj1 = { score: 100 };
	const obj2 = { score: 50 };

	const encoded1 = EncodedObject.encode(obj1, "2024-01-03T00:00:00Z");
	const encoded2 = EncodedObject.encode(obj2, "2024-01-02T00:00:00Z");

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(false); // obj1's value was kept (no change)
	const result = encoded1.decode<{ score: number }>();
	expect(result.score).toBe(100);
});

test("EncodedObject.merge handles objects with different properties", () => {
	const obj1 = { name: "Charlie", age: 25 };
	const obj2 = { age: 30, city: "NYC" };

	const encoded1 = EncodedObject.encode(obj1, "2024-01-01T00:00:00Z");
	const encoded2 = EncodedObject.encode(obj2, "2024-01-02T00:00:00Z");

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(true); // age was updated and city was added
	const result = encoded1.decode<{
		name: string;
		age: number;
		city: string;
	}>();
	expect(result).toEqual({ name: "Charlie", age: 30, city: "NYC" });
});

test("EncodedObject.merge returns changed=false when merging identical objects", () => {
	const obj = { name: "Alice" };

	const encoded1 = EncodedObject.encode(obj, "2024-01-01T00:00:00Z");
	const encoded2 = EncodedObject.encode(obj, "2024-01-01T00:00:00Z");

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(false); // No change
});

test("EncodedObject.merge returns changed=false when obj2 only has older values", () => {
	const encoded1 = EncodedObject.encode(
		{ name: "Alice", age: 30 },
		"2024-01-03T00:00:00Z",
	);
	const encoded2 = EncodedObject.encode(
		{ name: "Bob", age: 25 },
		"2024-01-01T00:00:00Z",
	);

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(false); // All obj1 values kept
	const result = encoded1.decode<{ name: string; age: number }>();
	expect(result).toEqual({ name: "Alice", age: 30 });
});

test("EncodedObject.set adds a new value with eventstamp", () => {
	const encoded = new EncodedObject();
	encoded.set("name", "Alice", "2024-01-01T00:00:00Z");
	encoded.set("age", 30, "2024-01-01T00:00:00Z");

	const result = encoded.decode<{ name: string; age: number }>();
	expect(result).toEqual({ name: "Alice", age: 30 });
});

test("EncodedObject.get retrieves a value", () => {
	const encoded = new EncodedObject();
	encoded.set("name", "Alice", "2024-01-01T00:00:00Z");

	expect(encoded.get("name")).toBe("Alice");
});

test("EncodedObject.delete marks a value as deleted", () => {
	const encoded = new EncodedObject();
	encoded.set("name", "Alice", "2024-01-01T00:00:00Z");

	encoded.delete("name");

	expect(encoded.get("name")).toBeUndefined();
	const result = encoded.decode<{ name?: string }>();
	expect(result.name).toBeUndefined();
});

test("EncodedObject.keys returns all non-deleted keys", () => {
	const encoded = EncodedObject.encode(
		{ name: "Alice", age: 30 },
		"2024-01-01T00:00:00Z",
	);

	const keys = encoded.keys();

	expect(keys).toContain("name");
	expect(keys).toContain("age");
	expect(keys).toHaveLength(2);
});

test("EncodedObject.values returns all key-value pairs", () => {
	const encoded = EncodedObject.encode(
		{ name: "Alice", age: 30 },
		"2024-01-01T00:00:00Z",
	);

	const values = encoded.values();

	expect(values).toContainEqual(["name", "Alice"]);
	expect(values).toContainEqual(["age", 30]);
});

test("EncodedObject.entries returns all key-value pairs", () => {
	const encoded = EncodedObject.encode(
		{ name: "Alice", age: 30 },
		"2024-01-01T00:00:00Z",
	);

	const entries = encoded.entries();

	expect(entries).toContainEqual(["name", "Alice"]);
	expect(entries).toContainEqual(["age", 30]);
});

test("EncodedObject.serialize returns tuple format", () => {
	const encoded = EncodedObject.encode(
		{ name: "Alice", age: 30 },
		"2024-01-01T00:00:00Z",
	);

	const serialized = encoded.serialize();

	expect(serialized.name).toBeDefined();
	expect(serialized.age).toBeDefined();
	expect(Array.isArray(serialized.name)).toBe(true);
	expect(Array.isArray(serialized.age)).toBe(true);
});

test("EncodedObject.deserialize reconstructs from tuple format", () => {
	const original = { name: "Alice", age: 30 };
	const encoded1 = EncodedObject.encode(original, "2024-01-01T00:00:00Z");
	const serialized = encoded1.serialize();

	const encoded2 = EncodedObject.deserialize(serialized);
	const decoded = encoded2.decode<typeof original>();

	expect(decoded).toEqual(original);
});

test("EncodedObject handles nested merges correctly", () => {
	const obj1 = {
		user: {
			name: "Alice",
			email: "alice@example.com",
		},
	};

	const obj2 = {
		user: {
			email: "alice.new@example.com",
		},
	};

	const encoded1 = EncodedObject.encode(obj1, "2024-01-01T00:00:00Z");
	const encoded2 = EncodedObject.encode(obj2, "2024-01-02T00:00:00Z");

	const changed = encoded1.merge(encoded2);

	expect(changed).toBe(true);
	const result = encoded1.decode<typeof obj1>();
	expect(result.user.name).toBe("Alice"); // Kept from obj1 (older)
	expect(result.user.email).toBe("alice.new@example.com"); // Updated from obj2 (newer)
});

test("EncodedObject.updateFrom updates object from plain object", () => {
	const encoded = EncodedObject.encode(
		{ name: "Alice", age: 30 },
		"2024-01-01T00:00:00Z",
	);

	const changed = encoded.updateFrom({ age: 31 }, "2024-01-02T00:00:00Z");

	expect(changed).toBe(true);
	const result = encoded.decode<{ name: string; age: number }>();
	expect(result).toEqual({ name: "Alice", age: 31 });
});

test("EncodedObject.updateFrom returns false when update has older eventstamp", () => {
	const encoded = EncodedObject.encode(
		{ name: "Alice" },
		"2024-01-03T00:00:00Z",
	);

	const changed = encoded.updateFrom(
		{ name: "Bob" },
		"2024-01-02T00:00:00Z",
	);

	expect(changed).toBe(false);
	const result = encoded.decode<{ name: string }>();
	expect(result.name).toBe("Alice"); // Kept original
});

test("EncodedObject.updateFrom adds new properties from plain object", () => {
	const encoded = EncodedObject.encode({ name: "Alice" }, "2024-01-01T00:00:00Z");

	const changed = encoded.updateFrom(
		{ age: 30, city: "NYC" },
		"2024-01-02T00:00:00Z",
	);

	expect(changed).toBe(true);
	const result = encoded.decode<{
		name: string;
		age: number;
		city: string;
	}>();
	expect(result).toEqual({ name: "Alice", age: 30, city: "NYC" });
});

test("EncodedObject has default meta with version 1 and deleted false", () => {
	const encoded = EncodedObject.encode({ name: "Alice" }, "2024-01-01T00:00:00Z");

	expect(encoded.getVersion()).toBe(1);
	expect(encoded.isMetaDeleted()).toBe(false);
});

test("EncodedObject.setVersion updates version metadata", () => {
	const encoded = EncodedObject.encode({ name: "Alice" }, "2024-01-01T00:00:00Z");

	encoded.setVersion(2);

	expect(encoded.getVersion()).toBe(2);
});

test("EncodedObject.setMetaDeleted updates deleted metadata", () => {
	const encoded = EncodedObject.encode({ name: "Alice" }, "2024-01-01T00:00:00Z");

	encoded.setMetaDeleted(true);

	expect(encoded.isMetaDeleted()).toBe(true);
});

test("EncodedObject.serialize includes __meta tuple [version, deleted]", () => {
	const encoded = EncodedObject.encode({ name: "Alice" }, "2024-01-01T00:00:00Z");
	encoded.setVersion(2);
	encoded.setMetaDeleted(true);

	const serialized = encoded.serialize();

	expect(serialized.__meta).toEqual([2, 1]);
});

test("EncodedObject.deserialize restores meta from __meta tuple", () => {
	const serialized: Record<string, unknown> = {
		__meta: [3, 1],
		name: ["Alice", "2024-01-01T00:00:00Z", 0],
	};

	const encoded = EncodedObject.deserialize(serialized);

	expect(encoded.getVersion()).toBe(3);
	expect(encoded.isMetaDeleted()).toBe(true);
});

test("EncodedObject serialize/deserialize round-trip preserves meta", () => {
	const original = EncodedObject.encode({ name: "Alice" }, "2024-01-01T00:00:00Z");
	original.setVersion(5);
	original.setMetaDeleted(true);

	const serialized = original.serialize();
	const restored = EncodedObject.deserialize(serialized);

	expect(restored.getVersion()).toBe(5);
	expect(restored.isMetaDeleted()).toBe(true);
	expect(restored.decode<{ name: string }>()).toEqual({ name: "Alice" });
});

// EncodedMap Tests
test("EncodedMap.get returns decoded value for existing key", () => {
	const map = new EncodedMap<{ name: string }>();
	const obj = EncodedObject.encode(
		{ name: "Alice" },
		"2024-01-01T00:00:00Z",
	);

	map.set("user1", obj);

	expect(map.get("user1")).toEqual({ name: "Alice" });
});

test("EncodedMap.get returns undefined for non-existent key", () => {
	const map = new EncodedMap<{ name: string }>();

	expect(map.get("nonexistent")).toBeUndefined();
});

test("EncodedMap.get returns undefined for deleted entry", () => {
	const map = new EncodedMap<{ name: string }>();
	const obj = EncodedObject.encode(
		{ name: "Alice" },
		"2024-01-01T00:00:00Z",
	);

	map.set("user1", obj);
	map.delete("user1");

	expect(map.get("user1")).toBeUndefined();
});

test("EncodedMap.set stores encoded object", () => {
	const map = new EncodedMap<{ name: string }>();
	const obj = EncodedObject.encode(
		{ name: "Alice" },
		"2024-01-01T00:00:00Z",
	);

	map.set("user1", obj);

	expect(map.get("user1")).toEqual({ name: "Alice" });
});

test("EncodedMap.setFrom creates new object and returns true", () => {
	const map = new EncodedMap<{ name: string }>();

	const changed = map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	expect(changed).toBe(true);
	expect(map.get("user1")).toEqual({ name: "Alice" });
});

test("EncodedMap.setFrom merges into existing object", () => {
	const map = new EncodedMap<{ name: string; age: number }>();
	map.setFrom("user1", { name: "Alice", age: 30 }, "2024-01-01T00:00:00Z");

	const changed = map.setFrom(
		"user1",
		{ age: 31 },
		"2024-01-02T00:00:00Z",
	);

	expect(changed).toBe(true);
	expect(map.get("user1")).toEqual({ name: "Alice", age: 31 });
});

test("EncodedMap.setFrom returns false when update has older timestamp", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-03T00:00:00Z");

	const changed = map.setFrom("user1", { name: "Bob" }, "2024-01-02T00:00:00Z");

	expect(changed).toBe(false);
	expect(map.get("user1")).toEqual({ name: "Alice" });
});

test("EncodedMap.delete marks object as deleted and returns true", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const changed = map.delete("user1");

	expect(changed).toBe(true);
	expect(map.get("user1")).toBeUndefined();
});

test("EncodedMap.delete returns false for non-existent key", () => {
	const map = new EncodedMap<{ name: string }>();

	const changed = map.delete("nonexistent");

	expect(changed).toBe(false);
});

test("EncodedMap.delete returns false when deleting already deleted entry", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	map.delete("user1");

	const changed = map.delete("user1");

	expect(changed).toBe(false);
});

test("EncodedMap.merge combines two maps", () => {
	const map1 = new EncodedMap<{ name: string }>();
	map1.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const map2 = new EncodedMap<{ name: string }>();
	map2.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");

	const changed = map1.merge(map2);

	expect(changed).toBe(true);
	expect(map1.get("user1")).toEqual({ name: "Alice" });
	expect(map1.get("user2")).toEqual({ name: "Bob" });
});

test("EncodedMap.merge resolves conflicts with Last-Write-Wins", () => {
	const map1 = new EncodedMap<{ name: string }>();
	map1.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const map2 = new EncodedMap<{ name: string }>();
	map2.setFrom("user1", { name: "Bob" }, "2024-01-02T00:00:00Z");

	const changed = map1.merge(map2);

	expect(changed).toBe(true);
	expect(map1.get("user1")).toEqual({ name: "Bob" });
});

test("EncodedMap.merge returns false when nothing changed", () => {
	const map1 = new EncodedMap<{ name: string }>();
	map1.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const map2 = new EncodedMap<{ name: string }>();
	map2.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const changed = map1.merge(map2);

	expect(changed).toBe(false);
});

test("EncodedMap.mergeObject merges single object at key", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const obj = EncodedObject.encode({ name: "Bob" }, "2024-01-02T00:00:00Z");
	const changed = map.mergeObject("user1", obj);

	expect(changed).toBe(true);
	expect(map.get("user1")).toEqual({ name: "Bob" });
});

test("EncodedMap.keys returns all keys including deleted", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	map.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");
	map.delete("user2");

	const keys = map.keys();

	expect(keys).toContain("user1");
	expect(keys).toContain("user2");
	expect(keys).toHaveLength(2);
});

test("EncodedMap.values returns only non-deleted entries", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	map.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");
	map.delete("user2");

	const values = map.values();

	expect(values).toContainEqual(["user1", { name: "Alice" }]);
	expect(values).not.toContainEqual(["user2", expect.anything()]);
	expect(values).toHaveLength(1);
});

test("EncodedMap.entries is alias for values", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const entries = map.entries();
	const values = map.values();

	expect(entries).toEqual(values);
});

test("EncodedMap.size includes deleted entries", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	map.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");
	map.delete("user2");

	expect(map.size).toBe(2);
});

test("EncodedMap.decode returns plain Map with non-deleted entries", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	map.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");
	map.delete("user2");

	const decoded = map.decode();

	expect(decoded.get("user1")).toEqual({ name: "Alice" });
	expect(decoded.get("user2")).toBeUndefined();
	expect(decoded.size).toBe(1);
});

test("EncodedMap.serialize returns serialized objects", () => {
	const map = new EncodedMap<{ name: string }>();
	map.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");

	const serialized = map.serialize();

	expect(serialized.user1).toBeDefined();
	expect(typeof serialized.user1).toBe("object");
});

test("EncodedMap.deserialize restores from serialized format", () => {
	const original = new EncodedMap<{ name: string }>();
	original.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	original.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");

	const serialized = original.serialize();
	const restored = EncodedMap.deserialize<{ name: string }>(serialized);

	expect(restored.get("user1")).toEqual({ name: "Alice" });
	expect(restored.get("user2")).toEqual({ name: "Bob" });
});

test("EncodedMap serialize/deserialize round-trip preserves deleted entries", () => {
	const original = new EncodedMap<{ name: string }>();
	original.setFrom("user1", { name: "Alice" }, "2024-01-01T00:00:00Z");
	original.setFrom("user2", { name: "Bob" }, "2024-01-01T00:00:00Z");
	original.delete("user2");

	const serialized = original.serialize();
	const restored = EncodedMap.deserialize<{ name: string }>(serialized);

	expect(restored.size).toBe(2); // Both keys preserved
	expect(restored.get("user1")).toEqual({ name: "Alice" });
	expect(restored.get("user2")).toBeUndefined(); // But user2 is deleted
	expect(restored.values()).toHaveLength(1); // Only one non-deleted
});
