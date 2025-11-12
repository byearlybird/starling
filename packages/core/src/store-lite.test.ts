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

	test("add via transaction", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.begin((tx) => {
			return tx.add({ text: "Buy milk", completed: false });
		});

		const todo = await store.get(id);
		expect(todo).toEqual({ text: "Buy milk", completed: false });
		await store.dispose();
	});

	test("add with custom ID", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		await store.begin((tx) => {
			tx.add({ text: "Buy milk", completed: false }, { withId: "todo1" });
		});

		const todo = await store.get("todo1");
		expect(todo).toEqual({ text: "Buy milk", completed: false });
		await store.dispose();
	});

	test("update via transaction", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.begin((tx) => {
			return tx.add({ text: "Buy milk", completed: false });
		});

		await store.begin((tx) => {
			tx.update(id, { completed: true });
		});

		const todo = await store.get(id);
		expect(todo).toEqual({ text: "Buy milk", completed: true });
		await store.dispose();
	});

	test("delete via transaction", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.begin((tx) => {
			return tx.add({ text: "Buy milk", completed: false });
		});

		await store.begin((tx) => {
			tx.del(id);
		});

		expect(await store.get(id)).toBeNull();
		await store.dispose();
	});

	test("transaction with multiple operations", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const [id1, id2] = await store.begin((tx) => {
			const id1 = tx.add({ text: "Task 1", completed: false });
			const id2 = tx.add({ text: "Task 2", completed: false });
			tx.update(id1, { completed: true });
			return [id1, id2];
		});

		expect(await store.get(id1)).toEqual({ text: "Task 1", completed: true });
		expect(await store.get(id2)).toEqual({ text: "Task 2", completed: false });
		await store.dispose();
	});

	test("transaction rollback", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		await store.begin((tx) => {
			tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
			tx.rollback();
		});

		expect(await store.get("todo1")).toBeNull();
		await store.dispose();
	});

	test("transaction rollback discards all changes", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.begin((tx) => {
			return tx.add({ text: "Task 1", completed: false });
		});

		await store.begin((tx) => {
			tx.update(id, { completed: true });
			tx.add({ text: "Task 2", completed: false }, { withId: "todo2" });
			tx.rollback();
		});

		// Original todo unchanged
		expect(await store.get(id)).toEqual({ text: "Task 1", completed: false });
		// New todo not added
		expect(await store.get("todo2")).toBeNull();
		await store.dispose();
	});

	test("tx.get reads from staging", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const result = await store.begin((tx) => {
			const id = tx.add({ text: "Task 1", completed: false });
			const todo = tx.get(id);
			return todo;
		});

		expect(result).toEqual({ text: "Task 1", completed: false });
		await store.dispose();
	});

	test("tx.get sees updates within transaction", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.begin((tx) => {
			return tx.add({ text: "Task 1", completed: false });
		});

		const result = await store.begin((tx) => {
			tx.update(id, { completed: true });
			return tx.get(id);
		});

		expect(result).toEqual({ text: "Task 1", completed: true });
		await store.dispose();
	});

	test("entries returns all non-deleted docs", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const [id1, id2, id3] = await store.begin((tx) => {
			const id1 = tx.add({ text: "Task 1", completed: false });
			const id2 = tx.add({ text: "Task 2", completed: true });
			const id3 = tx.add({ text: "Task 3", completed: false });
			return [id1, id2, id3];
		});

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

		const [id1, id2] = await store.begin((tx) => {
			const id1 = tx.add({ text: "Task 1", completed: false });
			const id2 = tx.add({ text: "Task 2", completed: true });
			return [id1, id2];
		});

		await store.begin((tx) => {
			tx.del(id1);
		});

		const entries = await store.entries();
		expect(entries).toHaveLength(1);
		expect(entries[0][0]).toBe(id2);

		await store.dispose();
	});

	test("collection returns all docs including deleted", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const [id1, id2] = await store.begin((tx) => {
			const id1 = tx.add({ text: "Task 1", completed: false });
			const id2 = tx.add({ text: "Task 2", completed: true });
			return [id1, id2];
		});

		await store.begin((tx) => {
			tx.del(id1);
		});

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
		await store1.begin((tx) => {
			tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
		});

		// Add to store2
		await store2.begin((tx) => {
			tx.add({ text: "Task 2", completed: false }, { withId: "todo2" });
		});

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
		await store1.begin((tx) => {
			tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
		});

		// Slight delay to ensure different timestamp
		await new Promise((resolve) => setTimeout(resolve, 5));

		await store2.begin((tx) => {
			tx.add({ text: "Task 2", completed: true }, { withId: "todo1" });
		});

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

		const id1 = await store.begin((tx) => {
			return tx.add({ text: "Task 1", completed: false });
		});

		const id2 = await store.begin((tx) => {
			return tx.add({ text: "Task 2", completed: false });
		});

		expect(id1).toBe("todo-1");
		expect(id2).toBe("todo-2");

		await store.dispose();
	});

	test("transaction returns callback return value", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const result = await store.begin((tx) => {
			const id = tx.add({ text: "Task 1", completed: false });
			return { id, message: "Created successfully" };
		});

		expect(result).toEqual({
			id: expect.any(String),
			message: "Created successfully",
		});

		await store.dispose();
	});

	test("partial update preserves unmodified fields", async () => {
		const store = await new StoreLite<Todo>({
			adapter: new InMemoryAdapter(),
		}).init();

		const id = await store.begin((tx) => {
			return tx.add({ text: "Task 1", completed: false });
		});

		await store.begin((tx) => {
			tx.update(id, { completed: true });
		});

		const todo = await store.get(id);
		expect(todo?.text).toBe("Task 1");
		expect(todo?.completed).toBe(true);

		await store.dispose();
	});
});
