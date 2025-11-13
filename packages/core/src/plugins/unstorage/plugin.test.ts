import { beforeEach, expect, test } from "bun:test";
import { createStorage } from "unstorage";
import type { Document } from "../../crdt";
import { Store } from "../../store";
import { unstoragePlugin } from "./plugin";

type Todo = {
	label: string;
	completed: boolean;
};

let storage: ReturnType<typeof createStorage<Document>>;
let store: Store<Todo>;

beforeEach(async () => {
	storage = createStorage<Document>();
	store = await new Store<Todo>().use(unstoragePlugin("todos", storage)).init();
});

test("initializes empty store when no data in storage", () => {
	expect(Array.from(store.entries())).toEqual([]);
});

test("initializes store with persisted data", async () => {
	// Create a store with data
	const store1 = await new Store<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	store1.begin((tx) => {
		tx.add({ label: "Test", completed: false }, { withId: "todo1" });
	});

	// Wait a tiny bit for debounce
	await new Promise((resolve) => setTimeout(resolve, 10));

	// Dispose to flush pending writes
	await store1.dispose();

	// Create a new store with same storage
	const store2 = await new Store<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
	await store2.dispose();
});

test("persists put operation to storage", async () => {
	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	// Wait a tiny bit for debounce (default is 0, but hooks may batch)
	await new Promise((resolve) => setTimeout(resolve, 10));

	// Dispose to flush pending writes
	await store.dispose();

	const persisted = (await storage.getItem("todos")) as Document | null;
	expect(persisted).toBeDefined();
	expect(persisted?.data.length).toBe(1);
	expect(persisted?.data[0]?.id).toBe("todo1");
	expect(persisted?.meta["~eventstamp"]).toBeDefined();
});

test("persists patch operation to storage", async () => {
	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	store.begin((tx) => {
		tx.update("todo1", { completed: true });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	const persisted = (await storage.getItem("todos")) as Document | null;
	expect(persisted).toBeDefined();
	expect(persisted?.data.length).toBe(1);
	expect(persisted?.data[0]?.id).toBe("todo1");
	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });
});

test("persists delete operation to storage", async () => {
	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	store.begin((tx) => {
		tx.del("todo1");
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	const persisted = (await storage.getItem("todos")) as Document | null;
	expect(persisted).toBeDefined();
	expect(persisted?.data.length).toBe(1);
	expect(persisted?.data[0]?.id).toBe("todo1");
	expect(store.get("todo1")).toBeNull();
});

test("debounces storage writes when debounceMs is set", async () => {
	const debounceStorage = createStorage<Document>();
	let writeCount = 0;

	const originalSet = debounceStorage.setItem;
	debounceStorage.setItem = async (key: string, value: Document) => {
		writeCount++;
		return originalSet.call(debounceStorage, key, value);
	};

	const debounceStore = await new Store<Todo>()
		.use(unstoragePlugin("todos", debounceStorage, { debounceMs: 100 }))
		.init();

	// Rapid writes should be batched
	debounceStore.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});
	debounceStore.begin((tx) => {
		tx.add({ label: "Task 2", completed: false }, { withId: "todo2" });
	});

	// No writes should have happened yet
	expect(writeCount).toBe(0);

	// Wait for debounce to complete
	await new Promise((resolve) => setTimeout(resolve, 150));

	// Should only have 1 write despite 2 mutations
	expect(writeCount).toBe(1);
});

test("forwards store clock to persisted eventstamp on load", async () => {
	// Create a store and add data with a known eventstamp
	const store1 = await new Store<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	store1.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});

	// Wait for persistence
	await new Promise((resolve) => setTimeout(resolve, 10));
	const persistedEventstamp = store1.document().meta["~eventstamp"];
	await store1.dispose();

	// Create a new store that loads the data
	const store2 = await new Store<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	// The new store's clock should have been forwarded to at least the persisted eventstamp
	const store2Latest = store2.document().meta["~eventstamp"];
	expect(store2Latest >= persistedEventstamp).toBe(true);

	// New writes should have higher eventstamps than the loaded data
	const beforeTimestamp = store2Latest;
	store2.begin((tx) => {
		tx.add({ label: "Task 2", completed: false }, { withId: "todo2" });
	});
	const afterTimestamp = store2.document().meta["~eventstamp"];
	expect(afterTimestamp > beforeTimestamp).toBe(true);

	// Verify the persisted data included the eventstamp
	const persisted = (await storage.getItem("todos")) as Document | null;
	expect(persisted?.meta["~eventstamp"]).toBeDefined();
	expect(persisted?.data.length).toBe(2);

	await store2.dispose();
});

test("disposes only after pending debounced writes complete", async () => {
	const debounceStorage = createStorage<Document>();
	const debouncedStore = await new Store<Todo>()
		.use(unstoragePlugin("todos", debounceStorage, { debounceMs: 500 }))
		.init();

	// Perform a mutation - this schedules a write that won't happen for 500ms
	debouncedStore.begin((tx) => {
		tx.add({ label: "Urgent task", completed: false }, { withId: "todo1" });
	});

	// Verify nothing is persisted yet
	let persisted = (await debounceStorage.getItem("todos")) as Document | null;
	expect(persisted).toBeNull();

	// Dispose immediately (before debounce completes)
	// The new behavior should wait for pending writes
	await debouncedStore.dispose();

	// Now the write should have completed
	persisted = (await debounceStorage.getItem("todos")) as Document | null;
	expect(persisted).toBeDefined();
	expect(persisted?.data.length).toBe(1);
	expect(persisted?.data[0]?.id).toBe("todo1");
});
