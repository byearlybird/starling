import { describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import { createDatabase } from "../db";
import { createQuery } from "./index";

const todoSchema = z.object({
	id: z.string(),
	text: z.string(),
	completed: z.boolean(),
	ownerId: z.string(),
	projectId: z.string().optional(),
});

const userSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	active: z.boolean(),
});

const projectSchema = z.object({
	id: z.string(),
	name: z.string(),
	archived: z.boolean(),
});

type Todo = z.infer<typeof todoSchema>;
type User = z.infer<typeof userSchema>;
type Project = z.infer<typeof projectSchema>;

describe("Query System", () => {
	describe("Single-Collection Queries", () => {
		it("filters items reactively", async () => {
			const db = await createDatabase({
				schema: {
					todos: {
						schema: todoSchema,
						getId: (t) => t.id,
					},
				},
			}).init();

			// Create reactive query
			const activeTodos = createQuery(db, (collections) => {
				return collections.todos.find((todo) => !todo.completed);
			});

			// Initially empty
			expect(activeTodos.results().length).toBe(0);

			// Add items
			db.todos.add({
				id: "1",
				text: "Active",
				completed: false,
				ownerId: "user1",
			});
			db.todos.add({
				id: "2",
				text: "Done",
				completed: true,
				ownerId: "user1",
			});

			// Query reflects added items
			const results = activeTodos.results();
			expect(results.length).toBe(1);
			expect(results[0].text).toBe("Active");

			activeTodos.dispose();
		});

		it("maps and sorts results", async () => {
			const db = await createDatabase({
				schema: {
					todos: {
						schema: todoSchema,
						getId: (t) => t.id,
					},
				},
			}).init();

			const todoTexts = createQuery(db, (collections) => {
				return collections.todos
					.find((todo) => !todo.completed)
					.map((todo) => todo.text)
					.sort((a, b) => a.localeCompare(b));
			});

			db.todos.add({
				id: "1",
				text: "Zebra",
				completed: false,
				ownerId: "user1",
			});
			db.todos.add({
				id: "2",
				text: "Apple",
				completed: false,
				ownerId: "user1",
			});
			db.todos.add({
				id: "3",
				text: "Mango",
				completed: true,
				ownerId: "user1",
			});

			const results = todoTexts.results();
			expect(results).toEqual(["Apple", "Zebra"]);

			todoTexts.dispose();
		});

		it("notifies on changes", async () => {
			const db = await createDatabase({
				schema: {
					todos: {
						schema: todoSchema,
						getId: (t) => t.id,
					},
				},
			}).init();

			const activeTodos = createQuery(db, (collections) => {
				return collections.todos.find((todo) => !todo.completed);
			});

			const onChange = mock(() => {});
			activeTodos.onChange(onChange);

			// Add matching item
			db.todos.add({
				id: "1",
				text: "Task",
				completed: false,
				ownerId: "user1",
			});
			expect(onChange).toHaveBeenCalledTimes(1);

			// Update to non-matching
			db.todos.update("1", { completed: true });
			expect(onChange).toHaveBeenCalledTimes(2);

			// Add non-matching item (still notifies because collection changed)
			db.todos.add({
				id: "2",
				text: "Done",
				completed: true,
				ownerId: "user1",
			});
			expect(onChange).toHaveBeenCalledTimes(3);

			activeTodos.dispose();
		});

		it("handles item removal", async () => {
			const db = await createDatabase({
				schema: {
					todos: {
						schema: todoSchema,
						getId: (t) => t.id,
					},
				},
			}).init();

			const activeTodos = createQuery(db, (collections) => {
				return collections.todos.find((todo) => !todo.completed);
			});

			db.todos.add({
				id: "1",
				text: "Task 1",
				completed: false,
				ownerId: "user1",
			});
			db.todos.add({
				id: "2",
				text: "Task 2",
				completed: false,
				ownerId: "user1",
			});

			expect(activeTodos.results().length).toBe(2);

			db.todos.remove("1");

			expect(activeTodos.results().length).toBe(1);
			expect(activeTodos.results()[0].id).toBe("2");

			activeTodos.dispose();
		});
	});

	describe("Multi-Collection Queries", () => {
		it("joins data from multiple collections", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
					users: { schema: userSchema, getId: (u) => u.id },
				},
			}).init();

			// Add test data
			db.users.add({
				id: "u1",
				name: "Alice",
				email: "alice@test.com",
				active: true,
			});
			db.users.add({
				id: "u2",
				name: "Bob",
				email: "bob@test.com",
				active: true,
			});

			db.todos.add({
				id: "t1",
				text: "Task 1",
				completed: false,
				ownerId: "u1",
			});
			db.todos.add({
				id: "t2",
				text: "Task 2",
				completed: false,
				ownerId: "u2",
			});

			// Create multi-collection query
			const todosWithOwners = createQuery(db, (collections) => {
				const results = [];
				const todos = collections.todos.find((t) => !t.completed);
				const users = collections.users.getAll();

				for (const todo of todos) {
					const owner = users.find((u) => u.id === todo.ownerId);
					if (owner) {
						results.push({
							id: todo.id,
							text: todo.text,
							ownerName: owner.name,
							ownerEmail: owner.email,
						});
					}
				}

				return results;
			});

			const results = todosWithOwners.results();
			expect(results.length).toBe(2);
			expect(results[0]).toEqual({
				id: "t1",
				text: "Task 1",
				ownerName: "Alice",
				ownerEmail: "alice@test.com",
			});
			expect(results[1]).toEqual({
				id: "t2",
				text: "Task 2",
				ownerName: "Bob",
				ownerEmail: "bob@test.com",
			});

			todosWithOwners.dispose();
		});

		it("reacts to changes in any joined collection", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
					users: { schema: userSchema, getId: (u) => u.id },
				},
			}).init();

			db.users.add({
				id: "u1",
				name: "Alice",
				email: "alice@test.com",
				active: true,
			});
			db.todos.add({
				id: "t1",
				text: "Task 1",
				completed: false,
				ownerId: "u1",
			});

			const todosWithOwners = createQuery(db, (collections) => {
				const results = [];
				const todos = collections.todos.getAll();
				const users = collections.users.getAll();

				for (const todo of todos) {
					const owner = users.find((u) => u.id === todo.ownerId);
					if (owner) {
						results.push({
							text: todo.text,
							ownerName: owner.name,
						});
					}
				}

				return results;
			});

			const onChange = mock(() => {});
			todosWithOwners.onChange(onChange);

			// Change in todos collection
			db.todos.update("t1", { text: "Updated Task" });
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(todosWithOwners.results()[0].text).toBe("Updated Task");

			// Change in users collection
			db.users.update("u1", { name: "Alice Smith" });
			expect(onChange).toHaveBeenCalledTimes(2);
			expect(todosWithOwners.results()[0].ownerName).toBe("Alice Smith");

			todosWithOwners.dispose();
		});

		it("only tracks accessed collections", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
					users: { schema: userSchema, getId: (u) => u.id },
					projects: { schema: projectSchema, getId: (p) => p.id },
				},
			}).init();

			db.todos.add({
				id: "t1",
				text: "Task",
				completed: false,
				ownerId: "u1",
			});

			// Query only accesses todos
			const simpleTodos = createQuery(db, (collections) => {
				return collections.todos.getAll().map((t) => ({ text: t.text }));
			});

			const onChange = mock(() => {});
			simpleTodos.onChange(onChange);

			// Change in todos → notification
			db.todos.update("t1", { text: "Updated" });
			expect(onChange).toHaveBeenCalledTimes(1);

			// Change in unaccessed collection → no notification
			db.users.add({
				id: "u1",
				name: "Alice",
				email: "alice@test.com",
				active: true,
			});
			expect(onChange).toHaveBeenCalledTimes(1); // Still 1

			simpleTodos.dispose();
		});

		it("handles three-way joins", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
					users: { schema: userSchema, getId: (u) => u.id },
					projects: { schema: projectSchema, getId: (p) => p.id },
				},
			}).init();

			// Setup data
			db.users.add({
				id: "u1",
				name: "Alice",
				email: "alice@test.com",
				active: true,
			});
			db.projects.add({ id: "p1", name: "Project Alpha", archived: false });

			db.todos.add({
				id: "t1",
				text: "Task 1",
				completed: false,
				ownerId: "u1",
				projectId: "p1",
			});

			// Three-way join
			const enrichedTodos = createQuery(db, (collections) => {
				const results = [];
				const todos = collections.todos.find((t) => !t.completed);
				const users = collections.users.getAll();
				const projects = collections.projects.find((p) => !p.archived);

				// Build lookup maps
				const userMap = new Map(users.map((u) => [u.id, u]));
				const projectMap = new Map(projects.map((p) => [p.id, p]));

				for (const todo of todos) {
					const owner = userMap.get(todo.ownerId);
					const project = todo.projectId
						? projectMap.get(todo.projectId)
						: null;

					if (owner) {
						results.push({
							id: todo.id,
							text: todo.text,
							ownerName: owner.name,
							projectName: project?.name ?? null,
						});
					}
				}

				return results;
			});

			const results = enrichedTodos.results();
			expect(results.length).toBe(1);
			expect(results[0]).toEqual({
				id: "t1",
				text: "Task 1",
				ownerName: "Alice",
				projectName: "Project Alpha",
			});

			enrichedTodos.dispose();
		});
	});

	describe("Query Lifecycle", () => {
		it("unsubscribes when disposed", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
				},
			}).init();

			const query = createQuery(db, (collections) => {
				return collections.todos.find((todo) => !todo.completed);
			});
			const onChange = mock(() => {});
			query.onChange(onChange);

			db.todos.add({
				id: "1",
				text: "Task",
				completed: false,
				ownerId: "user1",
			});
			expect(onChange).toHaveBeenCalledTimes(1);

			query.dispose();

			// After dispose, no more notifications
			db.todos.add({
				id: "2",
				text: "Task 2",
				completed: false,
				ownerId: "user1",
			});
			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it("allows unsubscribing individual listeners", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
				},
			}).init();

			const query = createQuery(db, (collections) => {
				return collections.todos.find((todo) => !todo.completed);
			});

			const listener1 = mock(() => {});
			const listener2 = mock(() => {});

			const unsub1 = query.onChange(listener1);
			query.onChange(listener2);

			db.todos.add({
				id: "1",
				text: "Task",
				completed: false,
				ownerId: "user1",
			});

			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);

			unsub1();

			db.todos.add({
				id: "2",
				text: "Task 2",
				completed: false,
				ownerId: "user1",
			});

			expect(listener1).toHaveBeenCalledTimes(1); // Still 1
			expect(listener2).toHaveBeenCalledTimes(2); // Incremented

			query.dispose();
		});

		it("returns empty array when disposed", async () => {
			const db = await createDatabase({
				schema: {
					todos: { schema: todoSchema, getId: (t) => t.id },
				},
			}).init();

			db.todos.add({
				id: "1",
				text: "Task",
				completed: false,
				ownerId: "user1",
			});

			const query = createQuery(db, (collections) => {
				return collections.todos.find((todo) => !todo.completed);
			});
			expect(query.results().length).toBe(1);

			query.dispose();
			expect(query.results().length).toBe(0);
		});
	});
});
