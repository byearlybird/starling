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
	expect(Array.from(store.entries())).toEqual([]);
});

test("initializes store with persisted data", async () => {
	// Create a store with data
	const store1 = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	store1.set((tx) => {
		tx.put({ label: "Test", completed: false }, { withId: "todo1" });
	});

	// Create a new store with same storage
	const store2 = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
});

test("persists put operation to storage", async () => {
	store.set((tx) => {
		tx.put({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	expect(persisted?.[0]?.["~id"]).toBe("todo1");
});

test("persists patch operation to storage", async () => {
	store.set((tx) => {
		tx.put({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	store.set((tx) => {
		tx.patch("todo1", { completed: true });
	});

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });
});

test("persists delete operation to storage", async () => {
	store.set((tx) => {
		tx.put({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	store.set((tx) => {
		tx.del("todo1");
	});

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	expect(store.get("todo1")).toBeNull();
});

test("debounces storage writes when debounceMs is set", async () => {
	const debounceStorage = createStorage<Document.EncodedDocument[]>();
	let writeCount = 0;

	const originalSet = debounceStorage.setItem;
	debounceStorage.setItem = async (
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
	debounceStore.set((tx) => {
		tx.put({ label: "Task 1", completed: false }, { withId: "todo1" });
	});
	debounceStore.set((tx) => {
		tx.put({ label: "Task 2", completed: false }, { withId: "todo2" });
	});

	// No writes should have happened yet
	expect(writeCount).toBe(0);

	// Wait for debounce to complete
	await new Promise((resolve) => setTimeout(resolve, 150));

	// Should only have 1 write despite 2 mutations
	expect(writeCount).toBe(1);
});
