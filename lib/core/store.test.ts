import { expect, mock, test } from "bun:test";
import { createStore } from "./store";

test("put() adds a new item and emits put event", () => {
	const store = createStore<{ name: string }>("users");

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
	const store = createStore<{ name: string }>("users");

	const putHandler = mock();
	store.on("put", putHandler);

	store.put("user1", { name: "Alice" });
	store.put("user1", { name: "Bob" });

	expect(putHandler).toHaveBeenCalledTimes(2);
	expect(store.values()).toEqual([{ key: "user1", value: { name: "Bob" } }]);
});

test("putMany() adds multiple items and emits put event", () => {
	const store = createStore<{ name: string }>("users");

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
	const store = createStore<{ name: string }>("users");

	store.put("user1", { name: "Alice" });

	const putHandler = mock();
	store.on("put", putHandler);

	store.putMany([
		{ key: "user1", value: { name: "Updated" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	expect(putHandler).toHaveBeenCalledTimes(1);
	expect(store.values()).toEqual([
		{ key: "user1", value: { name: "Updated" } },
		{ key: "user2", value: { name: "Bob" } },
	]);
});

test("update() modifies existing item and emits update event", () => {
	const store = createStore<{ name: string; age?: number }>("users");

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

test("update() is a graceful no-op when key does not exist", () => {
	const store = createStore<{ name: string }>("users");

	const updateHandler = mock();
	store.on("update", updateHandler);

	// Should not throw or emit event
	store.update("nonexistent", { name: "Alice" });

	expect(updateHandler).toHaveBeenCalledTimes(0);
	expect(store.values()).toEqual([]);
});

test("updateMany() modifies multiple items and emits update event", () => {
	const store = createStore<{ name: string; age?: number }>("users");

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

test("updateMany() gracefully skips nonexistent keys", () => {
	const store = createStore<{ name: string }>("users");

	store.put("user1", { name: "Alice" });

	const updateHandler = mock();
	store.on("update", updateHandler);

	// Should update only user1, silently ignore nonexistent
	store.updateMany([
		{ key: "user1", value: { name: "Updated" } },
		{ key: "nonexistent", value: { name: "Bob" } },
	]);

	expect(updateHandler).toHaveBeenCalledTimes(1);
	expect(store.values()).toEqual([
		{ key: "user1", value: { name: "Updated" } },
	]);
});

test("delete() soft-deletes an item and emits delete event", () => {
	const store = createStore<{ name: string }>("users");

	store.put("user1", { name: "Alice" });

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	store.delete("user1");

	expect(deleteHandler).toHaveBeenCalledWith([{ key: "user1" }]);
	expect(deleteHandler).toHaveBeenCalledTimes(1);
});

test("delete() is a graceful no-op when key does not exist", () => {
	const store = createStore<{ name: string }>("users");

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	// Should not throw or emit event
	store.delete("nonexistent");

	expect(deleteHandler).toHaveBeenCalledTimes(0);
});

test("deleteMany() soft-deletes multiple items and emits delete event", () => {
	const store = createStore<{ name: string }>("users");

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	store.deleteMany(["user1", "user2"]);

	expect(deleteHandler).toHaveBeenCalledWith([
		{ key: "user1" },
		{ key: "user2" },
	]);
	expect(deleteHandler).toHaveBeenCalledTimes(1);
});

test("deleteMany() gracefully skips nonexistent keys", () => {
	const store = createStore<{ name: string }>("users");

	store.put("user1", { name: "Alice" });

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	// Should delete only user1, silently ignore nonexistent
	store.deleteMany(["user1", "nonexistent"]);

	expect(deleteHandler).toHaveBeenCalledTimes(1);
	expect(deleteHandler).toHaveBeenCalledWith([{ key: "user1" }]);
});

test("values() returns decoded non-deleted items", () => {
	const store = createStore<{ name: string }>("users");

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	store.delete("user2");

	const values = store.values();

	expect(values).toEqual([{ key: "user1", value: { name: "Alice" } }]);
});

test("values() excludes deleted items", () => {
	const store = createStore<{ name: string }>("users");

	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
		{ key: "user3", value: { name: "Charlie" } },
	]);

	store.deleteMany(["user2"]);

	const values = store.values();

	expect(values.map((v) => v.key)).toEqual(["user1", "user3"]);
});

test("snapshot() returns raw encoded state including deleted items", () => {
	const store = createStore<{ name: string }>("users");

	store.put("user1", { name: "Alice" });
	store.put("user2", { name: "Bob" });
	store.delete("user2");

	const snapshot = store.snapshot();
	const snapshotMap = new Map(snapshot.map((item) => [item.key, item.value]));

	expect(snapshotMap.has("user1")).toBe(true);
	expect(snapshotMap.has("user2")).toBe(true);
	expect(snapshotMap.get("user2")?.__deleted).toBeDefined();
});

test("on() returns unsubscribe function that stops callbacks", () => {
	const store = createStore<{ name: string }>("users");

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
	const store = createStore<{ name: string }>("users");

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
	const store = createStore<{ name: string }>("users");

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
	const store = createStore<{ name: string; profile?: { bio: string } }>(
		"users",
	);

	store.put("user1", { name: "Alice", profile: { bio: "Hello" } });
	store.update("user1", { profile: { bio: "Updated" } });

	const values = store.values();

	expect(values[0]?.value).toEqual({
		name: "Alice",
		profile: { bio: "Updated" },
	});
});

test("store operations are synchronous", () => {
	const store = createStore<{ name: string }>("users");

	const start = performance.now();
	for (let i = 0; i < 1000; i++) {
		store.put(`user${i}`, { name: `User ${i}` });
	}
	const duration = performance.now() - start;

	// Should complete in less than 100ms for 1000 puts
	expect(duration).toBeLessThan(100);
	expect(store.values()).toHaveLength(1000);
});

test("merge() adds new items and emits put event", () => {
	const store = createStore<{ name: string }>("users");

	const putHandler = mock();
	store.on("put", putHandler);

	const snapshot = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2000-01-01T00:00:00.000Z|00000001",
				},
			},
		},
	];

	store.merge(snapshot);

	expect(putHandler).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice" } },
	]);
	expect(putHandler).toHaveBeenCalledTimes(1);
});

test("merge() updates existing items and emits update event", () => {
	const store = createStore<{ name: string }>("users");

	// Add initial item
	store.put("user1", { name: "Alice" });

	const updateHandler = mock();
	store.on("update", updateHandler);

	// Merge with newer version
	const snapshot = [
		{
			key: "user1",
			value: {
				name: { __value: "Bob", __eventstamp: "2999-12-31T23:59:59.999Z|ffffffff" },
			},
		},
	];

	store.merge(snapshot);

	expect(updateHandler).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Bob" } },
	]);
	expect(updateHandler).toHaveBeenCalledTimes(1);
});

test("merge() deletes items when __deleted is introduced and emits delete event", () => {
	const store = createStore<{ name: string }>("users");

	// Add initial item
	store.put("user1", { name: "Alice" });

	const deleteHandler = mock();
	store.on("delete", deleteHandler);

	// Merge with deletion marker
	const snapshot = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice",
					__eventstamp: "2000-01-01T00:00:00.000Z|00000001",
				},
				__deleted: {
					__value: true,
					__eventstamp: "2999-12-31T23:59:59.999Z|ffffffff",
				},
			},
		},
	];

	store.merge(snapshot);

	expect(deleteHandler).toHaveBeenCalledWith([{ key: "user1" }]);
	expect(deleteHandler).toHaveBeenCalledTimes(1);
	expect(store.values()).toHaveLength(0);
});

test("merge() handles multiple items with mixed operations", () => {
	const store = createStore<{ name: string }>("users");

	// Add initial items
	store.putMany([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	const putHandler = mock();
	const updateHandler = mock();
	const deleteHandler = mock();

	store.on("put", putHandler);
	store.on("update", updateHandler);
	store.on("delete", deleteHandler);

	// Merge with: new item (user3), updated item (user1), deleted item (user2)
	const snapshot = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Alice Updated",
					__eventstamp: "2999-12-31T23:59:59.999Z|ffffffff",
				},
			},
		},
		{
			key: "user2",
			value: {
				name: { __value: "Bob", __eventstamp: "01ARZ3NDEKTSV4RRFFQ69G5FAV001" },
				__deleted: {
					__value: true,
					__eventstamp: "2999-12-31T23:59:59.999Z|ffffffff",
				},
			},
		},
		{
			key: "user3",
			value: {
				name: {
					__value: "Charlie",
					__eventstamp: "2999-12-31T23:59:59.999Z|ffffffff",
				},
			},
		},
	];

	store.merge(snapshot);

	expect(putHandler).toHaveBeenCalledWith([
		{ key: "user3", value: { name: "Charlie" } },
	]);
	expect(updateHandler).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice Updated" } },
	]);
	expect(deleteHandler).toHaveBeenCalledWith([{ key: "user2" }]);

	expect(store.values()).toEqual([
		{ key: "user1", value: { name: "Alice Updated" } },
		{ key: "user3", value: { name: "Charlie" } },
	]);
});

test("merge() ignores items with older eventstamps", () => {
	const store = createStore<{ name: string }>("users");

	// Add initial item with newer timestamp
	store.put("user1", { name: "Alice" });

	const updateHandler = mock();
	store.on("update", updateHandler);

	// Try to merge with older version
	const snapshot = [
		{
			key: "user1",
			value: {
				name: {
					__value: "Older",
					__eventstamp: "2000-01-01T00:00:00.000Z|00000001",
				},
			},
		},
	];

	store.merge(snapshot);

	// Should not emit update because incoming value is older
	expect(updateHandler).toHaveBeenCalledTimes(0);
	expect(store.values()).toEqual([{ key: "user1", value: { name: "Alice" } }]);
});

test("merge() handles empty snapshot gracefully", () => {
	const store = createStore<{ name: string }>("users");

	store.put("user1", { name: "Alice" });

	const putHandler = mock();
	const updateHandler = mock();
	const deleteHandler = mock();

	store.on("put", putHandler);
	store.on("update", updateHandler);
	store.on("delete", deleteHandler);

	store.merge([]);

	expect(putHandler).toHaveBeenCalledTimes(0);
	expect(updateHandler).toHaveBeenCalledTimes(0);
	expect(deleteHandler).toHaveBeenCalledTimes(0);
	expect(store.values()).toEqual([{ key: "user1", value: { name: "Alice" } }]);
});
