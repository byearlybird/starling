import { describe, expect, test } from "bun:test";
import { InMemoryAdapter } from "./memory";

describe("InMemoryAdapter", () => {
	test("get returns undefined for missing keys", async () => {
		const adapter = new InMemoryAdapter<string>();
		expect(await adapter.get("missing")).toBeUndefined();
	});

	test("set and get", async () => {
		const adapter = new InMemoryAdapter<string>();
		await adapter.set("key1", "value1");
		expect(await adapter.get("key1")).toBe("value1");
	});

	test("has returns true for existing keys", async () => {
		const adapter = new InMemoryAdapter<string>();
		await adapter.set("key1", "value1");
		expect(await adapter.has("key1")).toBe(true);
		expect(await adapter.has("missing")).toBe(false);
	});

	test("delete returns true when key exists", async () => {
		const adapter = new InMemoryAdapter<string>();
		await adapter.set("key1", "value1");
		expect(await adapter.delete("key1")).toBe(true);
		expect(await adapter.get("key1")).toBeUndefined();
	});

	test("delete returns false when key does not exist", async () => {
		const adapter = new InMemoryAdapter<string>();
		expect(await adapter.delete("missing")).toBe(false);
	});

	test("entries returns all key-value pairs", async () => {
		const adapter = new InMemoryAdapter<string>();
		await adapter.set("key1", "value1");
		await adapter.set("key2", "value2");
		await adapter.set("key3", "value3");

		const entries = await adapter.entries();
		expect(entries).toHaveLength(3);
		expect(entries).toContainEqual(["key1", "value1"]);
		expect(entries).toContainEqual(["key2", "value2"]);
		expect(entries).toContainEqual(["key3", "value3"]);
	});

	test("size returns number of entries", async () => {
		const adapter = new InMemoryAdapter<string>();
		expect(await adapter.size()).toBe(0);

		await adapter.set("key1", "value1");
		expect(await adapter.size()).toBe(1);

		await adapter.set("key2", "value2");
		expect(await adapter.size()).toBe(2);

		await adapter.delete("key1");
		expect(await adapter.size()).toBe(1);
	});

	test("clear removes all entries", async () => {
		const adapter = new InMemoryAdapter<string>();
		await adapter.set("key1", "value1");
		await adapter.set("key2", "value2");
		await adapter.set("key3", "value3");

		await adapter.clear();
		expect(await adapter.size()).toBe(0);
		expect(await adapter.entries()).toHaveLength(0);
	});

	test("overwrites existing values", async () => {
		const adapter = new InMemoryAdapter<string>();
		await adapter.set("key1", "value1");
		await adapter.set("key1", "value2");
		expect(await adapter.get("key1")).toBe("value2");
	});

	test("works with complex objects", async () => {
		type Todo = { text: string; completed: boolean };
		const adapter = new InMemoryAdapter<Todo>();

		const todo: Todo = { text: "Buy milk", completed: false };
		await adapter.set("todo1", todo);

		const retrieved = await adapter.get("todo1");
		expect(retrieved).toEqual(todo);
	});
});
