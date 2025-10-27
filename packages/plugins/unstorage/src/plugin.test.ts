import { beforeEach, expect, test } from "bun:test";
import { type Document, Store } from "@byearlybird/starling";
import { createStorage } from "unstorage";
import { unstoragePlugin } from "./plugin";

type Todo = {
        label: string;
        completed: boolean;
};

const putWithId = <T>(
        target: { put: (value: T, options?: { withId?: string }) => string },
        id: string,
        value: T,
) => target.put(value, { withId: id });

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

	putWithId(store1, "todo1", { label: "Test", completed: false });

	// Create a new store with same storage
	const store2 = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	expect(store2.size).toBe(1);
	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
});

test("persists put operation to storage", async () => {
	putWithId(store, "todo1", { label: "Buy milk", completed: false });

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	expect(persisted?.[0]?.["~id"]).toBe("todo1");
});

test("persists patch operation to storage", async () => {
	putWithId(store, "todo1", { label: "Buy milk", completed: false });
	store.patch("todo1", { completed: true });

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);

	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });
});

test("persists delete operation to storage", async () => {
	putWithId(store, "todo1", { label: "Buy milk", completed: false });
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
	putWithId(store, "todo1", { label: "Task 1", completed: false });
	putWithId(store, "todo2", { label: "Task 2", completed: true });
	putWithId(store, "todo3", { label: "Task 3", completed: false });

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
	putWithId(debounceStore, "todo1", { label: "Task 1", completed: false });
	putWithId(debounceStore, "todo2", { label: "Task 2", completed: false });
	putWithId(debounceStore, "todo3", { label: "Task 3", completed: false });

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

	putWithId(defaultStore, "todo1", { label: "Task 1", completed: false });
	putWithId(defaultStore, "todo2", { label: "Task 2", completed: false });

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

	putWithId(debounceStore, "todo1", { label: "Task 1", completed: false });

	// Dispose before debounce completes
	await debounceStore.dispose();

	// Wait longer than debounce period
	await new Promise((resolve) => setTimeout(resolve, 200));

	// No write should have happened because we disposed
	expect(writeCount).toBe(0);
});

test("onBeforeSet hook filters documents before persisting", async () => {
	const idsCaptured: Array<ReadonlyArray<string>> = [];

	const hookStore = await Store.create<Todo>()
		.use(
			unstoragePlugin("todos", storage, {
				onBeforeSet: async (docs) => {
					idsCaptured.push(docs.map((doc) => doc["~id"]));
					return docs.filter((doc) => doc["~id"] !== "skip-me");
				},
			}),
		)
		.init();

	putWithId(hookStore, "todo1", { label: "Keep", completed: false });
	putWithId(hookStore, "skip-me", { label: "Drop", completed: false });

	// allow async hook + storage write to settle
	await new Promise((resolve) => setTimeout(resolve, 0));

	const persisted = (await storage.getItem("todos")) as
		| Document.EncodedDocument[]
		| null;

	expect(idsCaptured.length).toBeGreaterThan(0);
	expect(persisted?.some((doc) => doc["~id"] === "skip-me")).toBe(false);
});

test("onAfterGet hook can mutate hydration payload", async () => {
	const writerStore = await Store.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	putWithId(writerStore, "todo1", { label: "Keep", completed: false });
	putWithId(writerStore, "todo2", { label: "Filter", completed: false });

	const filteredStore = await Store.create<Todo>()
		.use(
			unstoragePlugin("todos", storage, {
				onAfterGet: async (docs) =>
					docs.filter((doc) => doc["~id"] !== "todo2"),
			}),
		)
		.init();

	expect(filteredStore.has("todo1")).toBe(true);
	expect(filteredStore.has("todo2")).toBe(false);
});
