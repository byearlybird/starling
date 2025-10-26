import { beforeEach, expect, test } from "bun:test";
import { type $document, $store } from "@byearlybird/starling";
import { createStorage } from "unstorage";
import { unstoragePlugin } from "./plugin";

type Todo = {
	label: string;
	completed: boolean;
};

let storage: ReturnType<typeof createStorage<$document.EncodedDocument[]>>;
let store: Awaited<ReturnType<typeof $store.create<Todo>>>;

beforeEach(async () => {
	storage = createStorage<$document.EncodedDocument[]>();
	store = await $store
		.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();
});

test("initializes empty store when no data in storage", () => {
	expect(store.size).toBe(0);
	expect(Array.from(store.values())).toEqual([]);
});

test("initializes store with persisted data", async () => {
	// Create a store with data
	const store1 = await $store
		.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	store1.put("todo1", { label: "Test", completed: false });

	// Create a new store with same storage
	const store2 = await $store
		.create<Todo>()
		.use(unstoragePlugin("todos", storage))
		.init();

	expect(store2.size).toBe(1);
	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
});

test("persists put operation to storage", async () => {
	store.put("todo1", { label: "Buy milk", completed: false });

	const persisted = (await storage.getItem("todos")) as
		| $document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);
	expect(persisted?.[0]?.__id).toBe("todo1");
});

test("persists patch operation to storage", async () => {
	store.put("todo1", { label: "Buy milk", completed: false });
	store.patch("todo1", { completed: true });

	const persisted = (await storage.getItem("todos")) as
		| $document.EncodedDocument[]
		| null;
	expect(persisted).toBeDefined();
	expect(persisted?.length).toBe(1);

	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });
});

test("persists delete operation to storage", async () => {
	store.put("todo1", { label: "Buy milk", completed: false });
	store.del("todo1");

	const persisted = (await storage.getItem("todos")) as
		| $document.EncodedDocument[]
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
		| $document.EncodedDocument[]
		| null;
	expect(persisted?.length).toBe(3);

	expect(store.size).toBe(3);
	expect(Array.from(store.values())).toHaveLength(3);
});
