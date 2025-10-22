import { expect, mock, test } from "bun:test";
import { KeyNotFoundError } from "./errors";
import { createStore } from "./store-v3";

// Simple monotonic timestamp for testing
const createEventstampFn = () => {
	let counter = 0;
	return () => {
		counter++;
		return `01ARZ3NDEKTSV4RRFFQ69G5FAV${String(counter).padStart(3, "0")}`;
	};
};

test("put() adds a new item and emits put event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	const putHandler = mock();
	store.on("put", putHandler);

	store.put("user1", { name: "Alice" });

	expect(putHandler).toHaveBeenCalledWith([
		{
			key: "user1",
			value: {
				name: "Alice",
			},
		},
	]);
	expect(putHandler).toHaveBeenCalledTimes(1);
});

test("put() replaces existing item and emits put event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	const putHandler = mock();
	store.on("put", putHandler);

	store.put("user1", { name: "Alice" });
	store.put("user1", { name: "Bob" });

	expect(putHandler).toHaveBeenCalledTimes(2);
	expect(store.values()).toEqual({
		user1: { name: "Bob" },
	});
});

test("putMany() adds multiple items and emits put event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	const putHandler = mock();
	store.on("put", putHandler);

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	expect(putHandler).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);
	expect(putHandler).toHaveBeenCalledTimes(1);
});

test("putMany() replaces existing items and emits put event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice" });

	const putHandler = mock();
	store.on("put", putHandler);

	store.putMany([
		{ key: "user1", value: { name: "Updated" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	expect(putHandler).toHaveBeenCalledTimes(1);
	expect(store.values()).toEqual({
		user1: { name: "Updated" },
		user2: { name: "Bob" },
	});
});

test("update() modifies existing item and emits update event", () => {
	const store = createStore<{ name: string; age?: number }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice" });

	const updateHandler = mock();
	store.on("update", updateHandler);

	store.update("user1", { age: 30 });

	expect(updateHandler).toHaveBeenCalledWith([
		{
			key: "user1",
			value: {
				name: "Alice",
				age: 30,
			},
		},
	]);
	expect(updateHandler).toHaveBeenCalledTimes(1);
});

test("update() throws KeyNotFoundError when key does not exist", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	expect(() => {
		store.update("nonexistent", { name: "Alice" });
	}).toThrow(KeyNotFoundError);
});

test("updateMany() modifies multiple items and emits update event", () => {
	const store = createStore<{ name: string; age?: number }>({
		eventstampFn: createEventstampFn(),
	});

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	const updateHandler = mock();
	store.on("update", updateHandler);

	store.updateMany([
		{ key: "user1", value: { age: 30 } },
		{ key: "user2", value: { age: 25 } },
	]);

	expect(updateHandler).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 30 } },
		{ key: "user2", value: { name: "Bob", age: 25 } },
	]);
	expect(updateHandler).toHaveBeenCalledTimes(1);
});

test("updateMany() throws KeyNotFoundError if any key does not exist", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice" });

	expect(() => {
		store.updateMany([
			{ key: "user1", value: { name: "Updated" } },
			{ key: "nonexistent", value: { name: "Bob" } },
		]);
	}).toThrow(KeyNotFoundError);
});

test("delete() soft-deletes an item and emits delete event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice" });

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	store.delete("user1");

	expect(deleteHandler).toHaveBeenCalledWith([{ key: "user1" }]);
	expect(deleteHandler).toHaveBeenCalledTimes(1);
});

test("delete() throws KeyNotFoundError when key does not exist", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	expect(() => {
		store.delete("nonexistent");
	}).toThrow(KeyNotFoundError);
});

test("deleteMany() soft-deletes multiple items and emits delete event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	store.deleteMany(["user1", "user2"]);

	expect(deleteHandler).toHaveBeenCalledWith([{ key: "user1" }, { key: "user2" }]);
	expect(deleteHandler).toHaveBeenCalledTimes(1);
});

test("deleteMany() throws KeyNotFoundError if any key does not exist", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice" });

	expect(() => {
		store.deleteMany(["user1", "nonexistent"]);
	}).toThrow(KeyNotFoundError);
});

test("values() returns decoded non-deleted items", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	store.delete("user2");

	const values = store.values();

	expect(values).toEqual({
		user1: { name: "Alice" },
	});
});

test("values() excludes deleted items", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
		{ key: "user3", value: { name: "Charlie" } },
	]);

	store.deleteMany(["user2"]);

	const values = store.values();

	expect(Object.keys(values)).toEqual(["user1", "user3"]);
});

test("snapshot() returns raw encoded state including deleted items", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice" });
	store.put("user2", { name: "Bob" });
	store.delete("user2");

	const snapshot = store.snapshot();

	expect(Object.keys(snapshot)).toContain("user1");
	expect(Object.keys(snapshot)).toContain("user2");
	expect(snapshot.user2?.__deleted).toBeDefined();
});

test("on() returns unsubscribe function that stops callbacks", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	let putCount = 0;
	const unsubscribe = store.on("put", () => {
		putCount++;
	});

	store.put("user1", { name: "Alice" });
	expect(putCount).toBe(1);

	unsubscribe();

	store.put("user2", { name: "Bob" });
	expect(putCount).toBe(1);
});

test("on() supports multiple listeners for the same event", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	let count1 = 0;
	let count2 = 0;

	store.on("put", () => {
		count1++;
	});

	store.on("put", () => {
		count2++;
	});

	store.put("user1", { name: "Alice" });

	expect(count1).toBe(1);
	expect(count2).toBe(1);
});

test("dispose() clears all event listeners", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	let putCount = 0;
	let updateCount = 0;
	let deleteCount = 0;

	store.on("put", () => {
		putCount++;
	});

	store.on("update", () => {
		updateCount++;
	});

	store.on("delete", () => {
		deleteCount++;
	});

	store.dispose();

	store.put("user1", { name: "Alice" });
	store.update("user1", { name: "Updated" });
	store.delete("user1");

	expect(putCount).toBe(0);
	expect(updateCount).toBe(0);
	expect(deleteCount).toBe(0);
});

test("merge preserves eventstamps and handles deep updates", () => {
	const store = createStore<{ name: string; profile?: { bio: string } }>({
		eventstampFn: createEventstampFn(),
	});

	store.put("user1", { name: "Alice", profile: { bio: "Hello" } });
	store.update("user1", { profile: { bio: "Updated" } });

	const values = store.values();

	expect(values.user1).toEqual({
		name: "Alice",
		profile: { bio: "Updated" },
	});
});

test("store operations are synchronous", () => {
	const store = createStore<{ name: string }>({
		eventstampFn: createEventstampFn(),
	});

	const start = performance.now();
	for (let i = 0; i < 1000; i++) {
		store.put(`user${i}`, { name: `User ${i}` });
	}
	const duration = performance.now() - start;

	// Should complete in less than 100ms for 1000 puts
	expect(duration).toBeLessThan(100);
	expect(Object.keys(store.values())).toHaveLength(1000);
});
