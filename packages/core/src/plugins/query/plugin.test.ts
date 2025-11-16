import { describe, expect, it, mock } from "bun:test";
import { createStore } from "../../store/store";
import { queryPlugin } from "./plugin";

type Todo = {
	text: string;
	completed: boolean;
	priority?: number;
};

describe("Query Plugin", () => {
	describe("Basic Filtering", () => {
		it("returns matching items", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Active task", completed: false }, { withId: "todo1" });
				tx.add(
					{ text: "Completed task", completed: true },
					{ withId: "todo2" },
				);
			});

			const results = activeQuery.results();
			expect(results.length).toBe(1);
			expect(results[0]?.[0]).toBe("todo1");
			expect(results[0]?.[1]).toEqual({
				text: "Active task",
				completed: false,
			});
		});

		it("returns empty array when no items match", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const completedQuery = store.query({
				where: (todo) => todo.completed,
			});

			store.begin((tx) => {
				tx.add({ text: "Active task", completed: false }, { withId: "todo1" });
			});

			expect(completedQuery.results().length).toBe(0);
		});

		it("includes all items when predicate always returns true", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const allQuery = store.query({ where: () => true });

			store.begin((tx) => {
				tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
				tx.add({ text: "Task 2", completed: true }, { withId: "todo2" });
				tx.add({ text: "Task 3", completed: false }, { withId: "todo3" });
			});

			expect(allQuery.results().length).toBe(3);
		});
	});

	describe("Reactivity", () => {
		it("updates query results when items are added", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			expect(activeQuery.results().length).toBe(0);

			store.begin((tx) => {
				tx.add({ text: "New task", completed: false }, { withId: "todo1" });
			});

			expect(activeQuery.results().length).toBe(1);
		});

		it("updates query results when items are updated", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			expect(activeQuery.results().length).toBe(1);

			store.begin((tx) => {
				tx.update("todo1", { completed: true });
			});

			expect(activeQuery.results().length).toBe(0);
		});

		it("updates query results when items are deleted", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
				tx.add({ text: "Task 2", completed: false }, { withId: "todo2" });
			});

			expect(activeQuery.results().length).toBe(2);

			store.begin((tx) => {
				tx.del("todo1");
			});

			expect(activeQuery.results().length).toBe(1);
			expect(activeQuery.results()[0]?.[0]).toBe("todo2");
		});

		it("adds items to query when they start matching", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Task", completed: true }, { withId: "todo1" });
			});

			expect(activeQuery.results().length).toBe(0);

			store.begin((tx) => {
				tx.update("todo1", { completed: false });
			});

			expect(activeQuery.results().length).toBe(1);
		});

		it("removes items from query when they stop matching", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			expect(activeQuery.results().length).toBe(1);

			store.begin((tx) => {
				tx.update("todo1", { completed: true });
			});

			expect(activeQuery.results().length).toBe(0);
		});
	});

	describe("Change Notifications", () => {
		it("calls onChange when items are added", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const onChange = mock(() => {});

			activeQuery.onChange(onChange);

			store.begin((tx) => {
				tx.add({ text: "New task", completed: false }, { withId: "todo1" });
			});

			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it("calls onChange when items are updated", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const onChange = mock(() => {});

			activeQuery.onChange(onChange);

			store.begin((tx) => {
				tx.update("todo1", { text: "Updated task" });
			});

			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it("calls onChange when items are deleted", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const onChange = mock(() => {});

			activeQuery.onChange(onChange);

			store.begin((tx) => {
				tx.del("todo1");
			});

			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it("does not call onChange when unrelated items change", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const onChange = mock(() => {});

			activeQuery.onChange(onChange);

			store.begin((tx) => {
				tx.add(
					{ text: "Completed task", completed: true },
					{ withId: "todo1" },
				);
			});

			expect(onChange).toHaveBeenCalledTimes(0);
		});

		it("allows unsubscribing from onChange", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const onChange = mock(() => {});

			const unsubscribe = activeQuery.onChange(onChange);

			store.begin((tx) => {
				tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
			});

			expect(onChange).toHaveBeenCalledTimes(1);

			unsubscribe();

			store.begin((tx) => {
				tx.add({ text: "Task 2", completed: false }, { withId: "todo2" });
			});

			expect(onChange).toHaveBeenCalledTimes(1); // Still 1, not 2
		});
	});

	describe("Projection (select)", () => {
		it("projects results using select function", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const textQuery = store.query({
				where: (todo) => !todo.completed,
				select: (todo) => todo.text,
			});

			store.begin((tx) => {
				tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
				tx.add({ text: "Task 2", completed: false }, { withId: "todo2" });
			});

			const results = textQuery.results();
			expect(results.length).toBe(2);
			expect(results[0]?.[1]).toBe("Task 1");
			expect(results[1]?.[1]).toBe("Task 2");
		});

		it("updates projected results reactively", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const textQuery = store.query({
				where: () => true,
				select: (todo) => todo.text,
			});

			store.begin((tx) => {
				tx.add({ text: "Original", completed: false }, { withId: "todo1" });
			});

			expect(textQuery.results()[0]?.[1]).toBe("Original");

			store.begin((tx) => {
				tx.update("todo1", { text: "Updated" });
			});

			expect(textQuery.results()[0]?.[1]).toBe("Updated");
		});
	});

	describe("Sorting (order)", () => {
		it("sorts results using order function", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const sortedQuery = store.query({
				where: () => true,
				order: (a, b) => a.text.localeCompare(b.text),
			});

			store.begin((tx) => {
				tx.add({ text: "Zebra", completed: false }, { withId: "todo1" });
				tx.add({ text: "Apple", completed: false }, { withId: "todo2" });
				tx.add({ text: "Mango", completed: false }, { withId: "todo3" });
			});

			const results = sortedQuery.results();
			expect(results[0]?.[1].text).toBe("Apple");
			expect(results[1]?.[1].text).toBe("Mango");
			expect(results[2]?.[1].text).toBe("Zebra");
		});

		it("combines select and order", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const sortedTextQuery = store.query({
				where: () => true,
				select: (todo) => todo.text,
				order: (a, b) => a.localeCompare(b),
			});

			store.begin((tx) => {
				tx.add({ text: "Zebra", completed: false }, { withId: "todo1" });
				tx.add({ text: "Apple", completed: false }, { withId: "todo2" });
			});

			const results = sortedTextQuery.results();
			expect(results[0]?.[1]).toBe("Apple");
			expect(results[1]?.[1]).toBe("Zebra");
		});

		it("sorts by numeric priority", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const priorityQuery = store.query({
				where: () => true,
				order: (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
			});

			store.begin((tx) => {
				tx.add(
					{ text: "Low", completed: false, priority: 1 },
					{ withId: "todo1" },
				);
				tx.add(
					{ text: "High", completed: false, priority: 10 },
					{ withId: "todo2" },
				);
				tx.add(
					{ text: "Medium", completed: false, priority: 5 },
					{ withId: "todo3" },
				);
			});

			const results = priorityQuery.results();
			expect(results[0]?.[1].priority).toBe(10);
			expect(results[1]?.[1].priority).toBe(5);
			expect(results[2]?.[1].priority).toBe(1);
		});
	});

	describe("Multiple Queries", () => {
		it("maintains multiple independent queries", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const completedQuery = store.query({ where: (todo) => todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Active", completed: false }, { withId: "todo1" });
				tx.add({ text: "Done", completed: true }, { withId: "todo2" });
			});

			expect(activeQuery.results().length).toBe(1);
			expect(completedQuery.results().length).toBe(1);
		});

		it("updates all affected queries on mutation", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const completedQuery = store.query({ where: (todo) => todo.completed });

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			expect(activeQuery.results().length).toBe(1);
			expect(completedQuery.results().length).toBe(0);

			store.begin((tx) => {
				tx.update("todo1", { completed: true });
			});

			expect(activeQuery.results().length).toBe(0);
			expect(completedQuery.results().length).toBe(1);
		});
	});

	describe("Query Lifecycle", () => {
		it("hydrates query on creation with existing data", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			store.begin((tx) => {
				tx.add({ text: "Task 1", completed: false }, { withId: "todo1" });
				tx.add({ text: "Task 2", completed: true }, { withId: "todo2" });
			});

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			expect(activeQuery.results().length).toBe(1);
			expect(activeQuery.results()[0]?.[0]).toBe("todo1");
		});

		it("cleans up query on dispose", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const activeQuery = store.query({ where: (todo) => !todo.completed });
			const onChange = mock(() => {});

			activeQuery.onChange(onChange);

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			expect(onChange).toHaveBeenCalledTimes(1);

			activeQuery.dispose();

			store.begin((tx) => {
				tx.add({ text: "Task 2", completed: false }, { withId: "todo2" });
			});

			expect(onChange).toHaveBeenCalledTimes(1); // Still 1, not 2
		});
	});

	describe("Plugin Lifecycle", () => {
		it("hydrates queries immediately on creation", async () => {
			const store = createStore<Todo>().use(queryPlugin());

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			const activeQuery = store.query({ where: (todo) => !todo.completed });

			// Query hydrates immediately with existing data
			expect(activeQuery.results().length).toBe(1);

			await store.init();

			// Still hydrated after init
			expect(activeQuery.results().length).toBe(1);
		});

		it("cleans up all queries on dispose", async () => {
			const store = await createStore<Todo>().use(queryPlugin()).init();

			const query1 = store.query({ where: () => true });
			const query2 = store.query({ where: () => true });

			store.begin((tx) => {
				tx.add({ text: "Task", completed: false }, { withId: "todo1" });
			});

			expect(query1.results().length).toBe(1);
			expect(query2.results().length).toBe(1);

			await store.dispose();

			// Queries should be cleared after dispose
			expect(query1.results().length).toBe(0);
			expect(query2.results().length).toBe(0);
		});
	});
});
