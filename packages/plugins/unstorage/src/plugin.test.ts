import { beforeEach, expect, test } from "bun:test";
import { type Document, Store } from "@byearlybird/starling";
import { createStorage } from "unstorage";
import { unstoragePlugin } from "./plugin";

type Todo = {
	label: string;
	completed: boolean;
};

let storage: ReturnType<typeof createStorage<Document.EncodedDocument[]>>;
let store: Awaited<ReturnType<typeof Store.create<Todo>>>;

beforeEach(async () => {
	storage = createStorage<Document.EncodedDocument[]>();
	store = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();
});

test("initializes empty store when no data in storage", () => {
	expect(store.size).toBe(0);
	expect(Array.from(store.values())).toEqual([]);
});

test("initializes store with persisted data", async () => {
	// Create a store with data
	const store1 = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	store1.put("todo1", { label: "Test", completed: false });

	// Create a new store with same storage
	const store2 = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	expect(store2.size).toBe(1);
	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
});

test("persists put operation to storage", async () => {
	store.put("todo1", { label: "Buy milk", completed: false });

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	expect(persisted?.[0]?.["~id"]).toBe("todo1");
});

test("persists patch operation to storage", async () => {
	store.put("todo1", { label: "Buy milk", completed: false });
	store.patch("todo1", { completed: true });

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);

	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });
});

test("persists delete operation to storage", async () => {
	store.put("todo1", { label: "Buy milk", completed: false });
	store.del("todo1");

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	// After delete, item should not be accessible from store
	expect(store.get("todo1")).toBeNull();
	expect(store.has("todo1")).toBe(false);
});

test("persists multiple items to storage", async () => {
	store.put("todo1", { label: "Task 1", completed: false });
	store.put("todo2", { label: "Task 2", completed: true });
	store.put("todo3", { label: "Task 3", completed: false });

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted?.length).toBe(3);

	expect(store.size).toBe(3);
	expect(Array.from(store.values())).toHaveLength(3);
});

test("debounces storage writes when debounceMs is set", async () => {
	const debounceStorage = createStorage<Document.EncodedDocument[]>();
	let writeCount = 0;

	// Spy on storage.set to count writes
	const originalSet = debounceStorage.set;
	debounceStorage.set = async (
		key: string,
		value: Document.EncodedDocument[],
	) => {
		writeCount++;
		return originalSet.call(debounceStorage, key, value);
	};

	const debounceStore = await Store.create<Todo>()
		.use(unstoragePlugin("todos", debounceStorage, { debounceMs: 100 }))
		.init();

	// Rapid writes should be batched
	debounceStore.put("todo1", { label: "Task 1", completed: false });
	debounceStore.put("todo2", { label: "Task 2", completed: false });
	debounceStore.put("todo3", { label: "Task 3", completed: false });

	// No writes should have happened yet
	expect(writeCount).toBe(0);

	// Wait for debounce to complete
	await new Promise((resolve) => setTimeout(resolve, 150));

	// Should only have 1 write despite 3 mutations
	expect(writeCount).toBe(1);

	// Verify all data was persisted
	const persisted = (await debounceStorage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted?.length).toBe(3);
});

test("writes immediately when debounceMs is 0 (default)", async () => {
	const defaultStorage = createStorage<Document.EncodedDocument[]>();
	let writeCount = 0;

	const originalSet = defaultStorage.set;
	defaultStorage.set = async (
		key: string,
		value: Document.EncodedDocument[],
	) => {
		writeCount++;
		return originalSet.call(defaultStorage, key, value);
	};

	const defaultStore = await Store.create<Todo>()
		.use(unstoragePlugin("todos", defaultStorage))
		.init();

	defaultStore.put("todo1", { label: "Task 1", completed: false });
	defaultStore.put("todo2", { label: "Task 2", completed: false });

	// Should have immediate writes with debounceMs=0
	expect(writeCount).toBe(2);
});

test("clears pending timer on dispose", async () => {
	const debounceStorage = createStorage<Document.EncodedDocument[]>();
	let writeCount = 0;

	const originalSet = debounceStorage.set;
	debounceStorage.set = async (
		key: string,
		value: Document.EncodedDocument[],
	) => {
		writeCount++;
		return originalSet.call(debounceStorage, key, value);
	};

	const debounceStore = await Store.create<Todo>()
		.use(unstoragePlugin("todos", debounceStorage, { debounceMs: 100 }))
		.init();

	debounceStore.put("todo1", { label: "Task 1", completed: false });

	// Dispose before debounce completes
	await debounceStore.dispose();

	// Wait longer than debounce period
	await new Promise((resolve) => setTimeout(resolve, 200));

	// No write should have happened because we disposed
	expect(writeCount).toBe(0);
});
