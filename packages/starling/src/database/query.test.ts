import { describe, expect, test } from "bun:test";
import { createMultiCollectionDb, createTestDb } from "./test-helpers";

describe("db.query()", () => {
	describe("basic queries", () => {
		test("returns result from callback", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query((q) => {
				return q.tasks.get("1");
			});

			expect(query.result).toEqual({
				id: "1",
				title: "Task 1",
				completed: false,
			});

			query.dispose();
		});

		test("supports getAll", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			db.tasks.add({ id: "2", title: "Task 2", completed: true });

			const query = db.query((q) => q.tasks.getAll());

			expect(query.result).toHaveLength(2);

			query.dispose();
		});

		test("supports find with filter", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			db.tasks.add({ id: "2", title: "Task 2", completed: true });
			db.tasks.add({ id: "3", title: "Task 3", completed: true });

			const query = db.query((q) => q.tasks.find((t) => t.completed === true));

			expect(query.result).toHaveLength(2);
			expect(query.result.every((t) => t.completed)).toBe(true);

			query.dispose();
		});

		test("supports queries across multiple collections", () => {
			const db = createMultiCollectionDb();
			db.tasks.add({ id: "t1", title: "Task 1", completed: false });
			db.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });

			const query = db.query((q) => ({
				tasks: q.tasks.getAll(),
				users: q.users.getAll(),
			}));

			expect(query.result.tasks).toHaveLength(1);
			expect(query.result.users).toHaveLength(1);

			query.dispose();
		});
	});

	describe("reactivity", () => {
		test("re-runs when accessed collection mutates", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query((q) => q.tasks.getAll());
			expect(query.result).toHaveLength(1);

			db.tasks.add({ id: "2", title: "Task 2", completed: false });
			expect(query.result).toHaveLength(2);

			query.dispose();
		});

		test("notifies subscribers on mutation", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const results: unknown[] = [];
			const query = db.query((q) => q.tasks.getAll());

			query.subscribe((result) => {
				results.push(result);
			});

			db.tasks.add({ id: "2", title: "Task 2", completed: false });

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveLength(2);

			query.dispose();
		});

		test("does NOT re-run when unaccessed collection mutates", () => {
			const db = createMultiCollectionDb();
			db.tasks.add({ id: "t1", title: "Task 1", completed: false });

			let runCount = 0;
			const query = db.query((q) => {
				runCount++;
				return q.tasks.getAll();
			});

			expect(runCount).toBe(1);

			// Mutate unaccessed collection
			db.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });

			expect(runCount).toBe(1); // Should not have re-run

			query.dispose();
		});

		test("re-runs only for accessed collections", () => {
			const db = createMultiCollectionDb();
			db.tasks.add({ id: "t1", title: "Task 1", completed: false });
			db.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });

			let runCount = 0;
			const query = db.query((q) => {
				runCount++;
				return q.tasks.getAll(); // Only access tasks
			});

			expect(runCount).toBe(1);

			db.users.add({ id: "u2", name: "Bob", email: "bob@example.com" });
			expect(runCount).toBe(1); // Users not accessed, should not re-run

			db.tasks.add({ id: "t2", title: "Task 2", completed: true });
			expect(runCount).toBe(2); // Tasks accessed, should re-run

			query.dispose();
		});

		test("handles update mutations", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query((q) => q.tasks.get("1"));
			expect(query.result?.completed).toBe(false);

			db.tasks.update("1", { completed: true });
			expect(query.result?.completed).toBe(true);

			query.dispose();
		});

		test("handles remove mutations", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query((q) => q.tasks.getAll());
			expect(query.result).toHaveLength(1);

			db.tasks.remove("1");
			expect(query.result).toHaveLength(0);

			query.dispose();
		});
	});

	describe("subscription management", () => {
		test("unsubscribe stops notifications", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const results: unknown[] = [];
			const query = db.query((q) => q.tasks.getAll());

			const unsubscribe = query.subscribe((result) => {
				results.push(result);
			});

			db.tasks.add({ id: "2", title: "Task 2", completed: false });
			expect(results).toHaveLength(1);

			unsubscribe();

			db.tasks.add({ id: "3", title: "Task 3", completed: false });
			expect(results).toHaveLength(1); // No new notification

			query.dispose();
		});

		test("multiple subscribers all receive updates", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const results1: unknown[] = [];
			const results2: unknown[] = [];
			const query = db.query((q) => q.tasks.getAll());

			query.subscribe((result) => results1.push(result));
			query.subscribe((result) => results2.push(result));

			db.tasks.add({ id: "2", title: "Task 2", completed: false });

			expect(results1).toHaveLength(1);
			expect(results2).toHaveLength(1);

			query.dispose();
		});

		test("dispose stops all updates", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			let runCount = 0;
			const query = db.query((q) => {
				runCount++;
				return q.tasks.getAll();
			});

			expect(runCount).toBe(1);

			query.dispose();

			db.tasks.add({ id: "2", title: "Task 2", completed: false });
			expect(runCount).toBe(1); // Should not have re-run after dispose

			// Result should still be accessible but stale
			expect(query.result).toHaveLength(1);
		});

		test("throws when subscribing to disposed query", () => {
			const db = createTestDb();

			const query = db.query((q) => q.tasks.getAll());
			query.dispose();

			expect(() => {
				query.subscribe(() => {});
			}).toThrow("Cannot subscribe to a disposed query");
		});

		test("dispose is idempotent", () => {
			const db = createTestDb();

			const query = db.query((q) => q.tasks.getAll());

			// Should not throw when called multiple times
			query.dispose();
			query.dispose();
			query.dispose();
		});
	});

	describe("transaction integration", () => {
		test("re-runs after transaction commits", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query((q) => q.tasks.getAll());
			expect(query.result).toHaveLength(1);

			db.begin((tx) => {
				tx.tasks.add({ id: "2", title: "Task 2", completed: false });
				tx.tasks.add({ id: "3", title: "Task 3", completed: true });
			});

			expect(query.result).toHaveLength(3);

			query.dispose();
		});
	});
});
