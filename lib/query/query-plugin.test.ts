import { expect, mock, test } from "bun:test";
import { createStore } from "../core";
import { createQueryEngine } from "./query-plugin";

type TestItem = { name: string; age: number };

test("query filters existing store items on initialization", () => {
	const store = createStore<TestItem>("users");
	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });
	store.put("user3", { name: "Charlie", age: 35 });

	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const results = query.results();
	expect(results.length).toBe(2);
	expect(results.some((r) => r.key === "user1")).toBe(true);
	expect(results.some((r) => r.key === "user3")).toBe(true);
	expect(results.some((r) => r.key === "user2")).toBe(false);
});

test("onChange fires when matching item is put", () => {
	const store = createStore<TestItem>("users");
	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.put("user1", { name: "Alice", age: 30 });

	expect(callback).toHaveBeenCalledTimes(1);

	const results = query.results();
	expect(results.length).toBe(1);
	const result = results.at(0);
	expect(result?.key).toBe("user1");
	expect(result?.value).toEqual({ name: "Alice", age: 30 });
});

test("onChange does not fire when non-matching item is put", () => {
	const store = createStore<TestItem>("users");
	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.put("user1", { name: "Bob", age: 25 });

	expect(callback).toHaveBeenCalledTimes(0);
});

test("onChange fires when matching item is deleted", () => {
	const store = createStore<TestItem>("users");
	store.put("user1", { name: "Alice", age: 30 });

	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.delete("user1");

	expect(callback).toHaveBeenCalledTimes(1);

	const results = query.results();
	expect(results.length).toBe(0);
});

test("onChange does not fire when non-matching item is deleted", () => {
	const store = createStore<TestItem>("users");
	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });

	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.delete("user2");

	expect(callback).toHaveBeenCalledTimes(0);
});

test("onChange fires when item updates and still matches", () => {
	const store = createStore<TestItem>("users");
	store.put("user1", { name: "Alice", age: 30 });

	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.update("user1", { age: 31 });

	expect(callback).toHaveBeenCalledTimes(1);

	const results = query.results();
	expect(results.at(0)?.value.age).toBe(31);
});

test("onChange fires when item updates and no longer matches predicate", () => {
	const store = createStore<TestItem>("users");
	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });

	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.update("user1", { age: 25 });

	expect(callback).toHaveBeenCalledTimes(1);

	const results = query.results();
	expect(results.length).toBe(1);
	expect(results.at(0)?.key).toBe("user2");
});

test("unsubscribe function stops receiving callbacks", () => {
	const store = createStore<TestItem>("users");
	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	const unsubscribe = query.onChange(callback);

	store.put("user1", { name: "Alice", age: 30 });
	expect(callback).toHaveBeenCalledTimes(1);

	unsubscribe();

	store.put("user2", { name: "Bob", age: 35 });
	expect(callback).toHaveBeenCalledTimes(1);
});

test("multiple onChange listeners receive callbacks independently", () => {
	const store = createStore<TestItem>("users");
	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback1 = mock();
	const callback2 = mock();
	query.onChange(callback1);
	query.onChange(callback2);

	store.put("user1", { name: "Alice", age: 30 });

	expect(callback1).toHaveBeenCalledTimes(1);
	expect(callback2).toHaveBeenCalledTimes(1);
});

test("results() returns current state as ArrayKV after multiple puts", () => {
	const store = createStore<TestItem>("users");
	const engine = createQueryEngine(store);
	const query = engine.query((item) => item.age >= 30);

	const callback = mock();
	query.onChange(callback);

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });
	store.put("user3", { name: "Charlie", age: 25 });

	expect(callback).toHaveBeenCalledTimes(2);

	const results = query.results();
	expect(results.length).toBe(2);
	expect(results.map((r) => r.key).sort()).toEqual(["user1", "user2"]);
});
