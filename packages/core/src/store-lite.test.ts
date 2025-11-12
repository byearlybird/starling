import { describe, expect, test } from "bun:test";
import { StoreLite } from "./store-lite";
import { InMemoryAdapter } from "./adapters/memory";
import type { EncodedDocument } from "./crdt";

type Todo = { text: string; completed: boolean };

describe("StoreLite", () => {
	test("creates a store with InMemoryAdapter", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		expect(store).toBeDefined();
		await store.dispose();
	});

	test("get returns null for missing keys", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		expect(await store.get("missing")).toBeNull();
		await store.dispose();
	});

	test("add document", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.add({ text: "Buy milk", completed: false });

		const todo = await store.get(id);
		expect(todo).toEqual({ text: "Buy milk", completed: false });
		await store.dispose();
	});

	test("add with custom ID", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		await store.add({ text: "Buy milk", completed: false }, { withId: "todo1" });

		const todo = await store.get("todo1");
		expect(todo).toEqual({ text: "Buy milk", completed: false });
		await store.dispose();
	});

	test("update document", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.add({ text: "Buy milk", completed: false });
		await store.update(id, { completed: true });

		const todo = await store.get(id);
		expect(todo).toEqual({ text: "Buy milk", completed: true });
		await store.dispose();
	});

	test("delete document", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.add({ text: "Buy milk", completed: false });
		await store.del(id);

		expect(await store.get(id)).toBeNull();
		await store.dispose();
	});

	test("entries returns all non-deleted docs", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id1 = await store.add({ text: "Task 1", completed: false });
		const id2 = await store.add({ text: "Task 2", completed: true });
		const id3 = await store.add({ text: "Task 3", completed: false });

		const entries = await store.entries();
		expect(entries).toHaveLength(3);
		expect(entries.map(([id]) => id)).toContain(id1);
		expect(entries.map(([id]) => id)).toContain(id2);
		expect(entries.map(([id]) => id)).toContain(id3);

		await store.dispose();
	});

	test("entries excludes deleted docs", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id1 = await store.add({ text: "Task 1", completed: false });
		const id2 = await store.add({ text: "Task 2", completed: true });
		await store.del(id1);

		const entries = await store.entries();
		expect(entries).toHaveLength(1);
		expect(entries[0][0]).toBe(id2);

		await store.dispose();
	});

	test("collection returns all docs including deleted", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id1 = await store.add({ text: "Task 1", completed: false });
		const id2 = await store.add({ text: "Task 2", completed: true });
		await store.del(id1);

		const collection = await store.collection();
		expect(collection["~docs"]).toHaveLength(2);
		expect(collection["~eventstamp"]).toBeDefined();

		await store.dispose();
	});

	test("merge combines two collections", async () => {
		const store1 = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const store2 = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		// Add to store1
		await store1.add({ text: "Task 1", completed: false }, { withId: "todo1" });

		// Add to store2
		await store2.add({ text: "Task 2", completed: false }, { withId: "todo2" });

		// Merge store2 into store1
		const collection2 = await store2.collection();
		await store1.merge(collection2);

		const entries = await store1.entries();
		expect(entries).toHaveLength(2);
		expect(entries.map(([id]) => id)).toContain("todo1");
		expect(entries.map(([id]) => id)).toContain("todo2");

		await store1.dispose();
		await store2.dispose();
	});

	test("merge resolves conflicts with LWW", async () => {
		const store1 = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const store2 = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		// Add same ID to both stores
		await store1.add({ text: "Task 1", completed: false }, { withId: "todo1" });

		// Slight delay to ensure different timestamp
		await new Promise((resolve) => setTimeout(resolve, 5));

		await store2.add({ text: "Task 2", completed: true }, { withId: "todo1" });

		// Merge store2 into store1 - store2's version should win (newer)
		const collection2 = await store2.collection();
		await store1.merge(collection2);

		const todo = await store1.get("todo1");
		expect(todo).toEqual({ text: "Task 2", completed: true });

		await store1.dispose();
		await store2.dispose();
	});

	test("custom ID generator", async () => {
		let counter = 0;
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
			getId: () => `todo-${++counter}`,
		}).init();

		const id1 = await store.add({ text: "Task 1", completed: false });
		const id2 = await store.add({ text: "Task 2", completed: false });

		expect(id1).toBe("todo-1");
		expect(id2).toBe("todo-2");

		await store.dispose();
	});

	test("partial update preserves unmodified fields", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.add({ text: "Task 1", completed: false });
		await store.update(id, { completed: true });

		const todo = await store.get(id);
		expect(todo?.text).toBe("Task 1");
		expect(todo?.completed).toBe(true);

		await store.dispose();
	});

	test("update non-existent document creates it", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		await store.update("new-id", { text: "New task", completed: false } as Todo);

		const todo = await store.get("new-id");
		expect(todo).toEqual({ text: "New task", completed: false });

		await store.dispose();
	});

	test("del on non-existent document is a no-op", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		await store.del("non-existent");

		const entries = await store.entries();
		expect(entries).toHaveLength(0);

		await store.dispose();
	});

	test("multiple operations work correctly", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id1 = await store.add({ text: "Task 1", completed: false });
		const id2 = await store.add({ text: "Task 2", completed: false });
		await store.update(id1, { completed: true });

		expect(await store.get(id1)).toEqual({ text: "Task 1", completed: true });
		expect(await store.get(id2)).toEqual({ text: "Task 2", completed: false });

		await store.dispose();
	});
});
