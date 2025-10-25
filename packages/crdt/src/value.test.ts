import { expect, test } from "bun:test";
import { $Document, $Record, $Value } from "./value";

// ============================================================================
// $Value Tests
// ============================================================================

test("$Value: stores data and eventstamp", () => {
	const value = new $Value("hello", "2024-01-01T00:00:00.000Z|00000001");

	expect(value.data).toBe("hello");
	expect(value.eventstamp).toBe("2024-01-01T00:00:00.000Z|00000001");
});

test("$Value: works with different data types", () => {
	const stringValue = new $Value("text", "2024-01-01T00:00:00.000Z|00000001");
	const numberValue = new $Value(42, "2024-01-01T00:00:00.000Z|00000002");
	const boolValue = new $Value(true, "2024-01-01T00:00:00.000Z|00000003");
	const objectValue = new $Value(
		{ name: "Alice" },
		"2024-01-01T00:00:00.000Z|00000004",
	);

	expect(stringValue.data).toBe("text");
	expect(numberValue.data).toBe(42);
	expect(boolValue.data).toBe(true);
	expect(objectValue.data).toEqual({ name: "Alice" });
});

test("$Value: setData updates the value", () => {
	const value = new $Value("initial", "2024-01-01T00:00:00.000Z|00000001");

	value.setData("updated");

	expect(value.data).toBe("updated");
});

test("$Value: serialize returns [data, eventstamp, 1]", () => {
	const value = new $Value("hello", "2024-01-01T00:00:00.000Z|00000001");
	const serialized = value.serialize();

	expect(serialized).toEqual(["hello", "2024-01-01T00:00:00.000Z|00000001", 1]);
	expect(serialized[2]).toBe(1);
});

test("$Value: deserialize creates instance from serialized form", () => {
	const serialized = ["hello", "2024-01-01T00:00:00.000Z|00000001", 1] as any;
	const value = $Value.deserialize(serialized);

	expect(value.data).toBe("hello");
	expect(value.eventstamp).toBe("2024-01-01T00:00:00.000Z|00000001");
});

test("$Value: roundtrip serialize/deserialize preserves data", () => {
	const original = new $Value(
		{ name: "Bob", age: 30 },
		"2024-01-01T00:00:00.000Z|00000001",
	);
	const serialized = original.serialize();
	const deserialized = $Value.deserialize(serialized);

	expect(deserialized.data).toEqual(original.data);
	expect(deserialized.eventstamp).toBe(original.eventstamp);
});

// ============================================================================
// $Record Tests
// ============================================================================

test("$Record: wraps a $Value with a property name", () => {
	const value = new $Value("john", "2024-01-01T00:00:00.000Z|00000001");
	const record = new $Record("name", value);

	expect(record.property).toBe("name");
	expect(record.data).toBe(value);
	expect((record.data as $Value<string>).data).toBe("john");
});

test("$Record: merge with newer eventstamp wins (Last-Write-Wins)", () => {
	const oldValue = new $Value("Alice", "2024-01-01T00:00:00.000Z|00000001");
	const newValue = new $Value("Bob", "2024-01-01T00:00:00.000Z|00000002");

	const record1 = new $Record("name", oldValue);
	const record2 = new $Record("name", newValue);

	const changed = record1.merge(record2);

	expect(changed).toBe(true);
	expect((record1.data as $Value<string>).data).toBe("Bob");
});

test("$Record: merge with older eventstamp is ignored", () => {
	const newValue = new $Value("Bob", "2024-01-01T00:00:00.000Z|00000002");
	const oldValue = new $Value("Alice", "2024-01-01T00:00:00.000Z|00000001");

	const record1 = new $Record("name", newValue);
	const record2 = new $Record("name", oldValue);

	const changed = record1.merge(record2);

	expect(changed).toBe(false);
	expect((record1.data as $Value<string>).data).toBe("Bob");
});

test("$Record: merge with same eventstamp is ignored", () => {
	const sameTimestamp = "2024-01-01T00:00:00.000Z|00000001";
	const value1 = new $Value("Alice", sameTimestamp);
	const value2 = new $Value("Bob", sameTimestamp);

	const record1 = new $Record("name", value1);
	const record2 = new $Record("name", value2);

	const changed = record1.merge(record2);

	expect(changed).toBe(false);
	expect((record1.data as $Value<string>).data).toBe("Alice");
});

test("$Record: merge throws on type mismatch (value vs record)", () => {
	const value = new $Value("data", "2024-01-01T00:00:00.000Z|00000001");
	const nestedRecord = new $Record(
		"nested",
		new $Value("nested data", "2024-01-01T00:00:00.000Z|00000002"),
	);

	const record1 = new $Record("field", value);
	const record2 = new $Record("field", nestedRecord);

	expect(() => {
		record1.merge(record2);
	}).toThrow();
});

test("$Record: serialize returns [property, serialized data]", () => {
	const value = new $Value("john", "2024-01-01T00:00:00.000Z|00000001");
	const record = new $Record("name", value);
	const serialized = record.serialize();

	expect(serialized[0]).toBe("name");
	expect(serialized[1]).toEqual([
		"john",
		"2024-01-01T00:00:00.000Z|00000001",
		1,
	]);
});

test("$Record: deserialize recreates record from serialized form", () => {
	const serialized = [
		"name",
		["john", "2024-01-01T00:00:00.000Z|00000001", 1],
	] as any;
	const record = $Record.deserialize(serialized);

	expect(record.property).toBe("name");
	expect((record.data as $Value<string>).data).toBe("john");
});

test("$Record: roundtrip serialize/deserialize preserves structure", () => {
	const value = new $Value(
		{ email: "test@example.com" },
		"2024-01-01T00:00:00.000Z|00000001",
	);
	const original = new $Record("contact", value);
	const serialized = original.serialize();
	const deserialized = $Record.deserialize(serialized);

	expect(deserialized.property).toBe(original.property);
	expect((deserialized.data as $Value<any>).data).toEqual(
		(original.data as $Value<any>).data,
	);
	expect((deserialized.data as $Value<any>).eventstamp).toBe(
		(original.data as $Value<any>).eventstamp,
	);
});

test("$Record: setData updates the data", () => {
	const value1 = new $Value("initial", "2024-01-01T00:00:00.000Z|00000001");
	const record = new $Record("field", value1);

	const value2 = new $Value("updated", "2024-01-01T00:00:00.000Z|00000002");
	record.setData(value2);

	expect((record.data as $Value<string>).data).toBe("updated");
});

test("$Record.from: creates $Record from flat object", () => {
	const obj = { name: "Alice" };
	const eventstamp = "2024-01-01T00:00:00.000Z|00000001";

	const record = $Record.from(obj, eventstamp);

	expect(record.property).toBe("name");
	expect(record.data instanceof $Value).toBe(true);
	expect((record.data as unknown as $Value<string>).data).toBe("Alice");
	expect((record.data as unknown as $Value<string>).eventstamp).toBe(
		eventstamp,
	);
});

test("$Record.from: creates nested $Record from nested object", () => {
	const obj = { user: { name: "Bob" } };
	const eventstamp = "2024-01-01T00:00:00.000Z|00000001";

	const record = $Record.from(obj, eventstamp);

	expect(record.property).toBe("user");
	expect(record.data instanceof $Record).toBe(true);

	const nested = record.data as $Record;
	expect(nested.property).toBe("name");
	expect(nested.data instanceof $Value).toBe(true);
	expect((nested.data as $Value<string>).data).toBe("Bob");
	expect((nested.data as $Value<string>).eventstamp).toBe(eventstamp);
});

// ============================================================================
// $Document Tests
// ============================================================================

test("$Document: creates document with id, data, version, and deleted flag", () => {
	const value = new $Value(
		{ title: "Test" },
		"2024-01-01T00:00:00.000Z|00000001",
	);
	const record = new $Record("title", value);
	const doc = new $Document("doc1", record, 1, false);

	expect(doc).toBeDefined();
});

test("$Document: serialize returns [id, serialized record, version, deleted flag]", () => {
	const value = new $Value("Hello", "2024-01-01T00:00:00.000Z|00000001");
	const record = new $Record("content", value);
	const doc = new $Document("doc1", record, 2, false);

	const serialized = doc.serialize();

	expect(serialized[0]).toBe("doc1");
	expect(serialized[2]).toBe(2);
	expect(serialized[3]).toBe(0);
});

test("$Document: setDeleted updates the deleted flag", () => {
	const value = new $Value("Test", "2024-01-01T00:00:00.000Z|00000001");
	const record = new $Record("field", value);
	const doc = new $Document("doc1", record, 1, false);

	doc.setDeleted(true);
	const serialized = doc.serialize();

	expect(serialized[3]).toBe(1);
});

test("$Document: from creates document from plain object", () => {
	const data = { title: "My Doc", description: "A test" };
	const eventstamp = "2024-01-01T00:00:00.000Z|00000001";

	const doc = $Document.from("doc1", data, eventstamp, 1, false);

	expect(doc).toBeDefined();
	const serialized = doc.serialize();
	expect(serialized[0]).toBe("doc1");
	expect(serialized[2]).toBe(1);
	expect(serialized[3]).toBe(0);
});

test("$Document: from creates document from nested object", () => {
	const data = {
		title: "Nested Doc",
		author: {
			name: "Alice",
			email: "alice@example.com",
		},
	};
	const eventstamp = "2024-01-01T00:00:00.000Z|00000001";

	const doc = $Document.from("doc2", data, eventstamp, 2, false);

	expect(doc).toBeDefined();
	const serialized = doc.serialize();
	expect(serialized[0]).toBe("doc2");
	expect(serialized[2]).toBe(2);
	expect(serialized[3]).toBe(0);

	console.log("serialized", serialized);
});
