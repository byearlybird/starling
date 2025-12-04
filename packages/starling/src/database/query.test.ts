import { describe, expect, test } from "bun:test";
import { createMultiCollectionDb, createTestDb } from "./test-helpers";

describe("db.query()", () => {
	describe("basic queries", () => {
		test("returns result from callback", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query(async (q) => {
				return await q.tasks.get("1");
			});

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(query.result).toEqual({
				id: "1",
				title: "Task 1",
				completed: false,
			});

			query.dispose();
		});

		test("supports getAll", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });
			await db.tasks.add({ id: "2", title: "Task 2", completed: true });

			const query = db.query(async (q) => await q.tasks.getAll());

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(query.result).toHaveLength(2);

			query.dispose();
		});

		test("supports find with filter", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });
			await db.tasks.add({ id: "2", title: "Task 2", completed: true });
			await db.tasks.add({ id: "3", title: "Task 3", completed: true });

			const query = db.query(async (q) =>
				await q.tasks.find((t) => t.completed === true),
			);

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(query.result).toHaveLength(2);
			expect(query.result?.every((t) => t.completed)).toBe(true);

			query.dispose();
		});

		test("supports queries across multiple collections", async () => {
			const db = await createMultiCollectionDb();
			await db.tasks.add({ id: "t1", title: "Task 1", completed: false });
			await db.users.add({
				id: "u1",
				name: "Alice",
				email: "alice@example.com",
			});

			const query = db.query(async (q) => ({
				tasks: await q.tasks.getAll(),
				users: await q.users.getAll(),
			}));

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(query.result?.tasks).toHaveLength(1);
			expect(query.result?.users).toHaveLength(1);

			query.dispose();
		});
	});

	describe("reactivity", () => {
		test("re-runs when accessed collection mutates", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query(async (q) => await q.tasks.getAll());

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result).toHaveLength(1);

			await db.tasks.add({ id: "2", title: "Task 2", completed: false });

			// Wait for query to re-run
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result).toHaveLength(2);

			query.dispose();
		});

		test("notifies subscribers on mutation", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const results: unknown[] = [];
			const query = db.query(async (q) => await q.tasks.getAll());

			query.subscribe((result) => {
				results.push(result);
			});

			await db.tasks.add({ id: "2", title: "Task 2", completed: false });

			// Wait for query to re-run
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveLength(2);

			query.dispose();
		});

		test("does NOT re-run when unaccessed collection mutates", async () => {
			const db = await createMultiCollectionDb();
			await db.tasks.add({ id: "t1", title: "Task 1", completed: false });

			let runCount = 0;
			const query = db.query(async (q) => {
				runCount++;
				return await q.tasks.getAll();
			});

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(runCount).toBe(1);

			// Mutate unaccessed collection
			await db.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });

			// Wait to ensure it doesn't re-run
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(runCount).toBe(1); // Should not have re-run

			query.dispose();
		});

		test("re-runs only for accessed collections", async () => {
			const db = await createMultiCollectionDb();
			await db.tasks.add({ id: "t1", title: "Task 1", completed: false });
			await db.users.add({
				id: "u1",
				name: "Alice",
				email: "alice@example.com",
			});

			let runCount = 0;
			const query = db.query(async (q) => {
				runCount++;
				return await q.tasks.getAll(); // Only access tasks
			});

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(runCount).toBe(1);

			await db.users.add({ id: "u2", name: "Bob", email: "bob@example.com" });
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(runCount).toBe(1); // Users not accessed, should not re-run

			await db.tasks.add({ id: "t2", title: "Task 2", completed: true });
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(runCount).toBe(2); // Tasks accessed, should re-run

			query.dispose();
		});

		test("handles update mutations", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query(async (q) => await q.tasks.get("1"));

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result?.completed).toBe(false);

			await db.tasks.update("1", { completed: true });

			// Wait for query to re-run
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result?.completed).toBe(true);

			query.dispose();
		});

		test("handles remove mutations", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query(async (q) => await q.tasks.getAll());

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result).toHaveLength(1);

			await db.tasks.remove("1");

			// Wait for query to re-run
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result).toHaveLength(0);

			query.dispose();
		});
	});

	describe("subscription management", () => {
		test("unsubscribe stops notifications", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const results: unknown[] = [];
			const query = db.query(async (q) => await q.tasks.getAll());

			const unsubscribe = query.subscribe((result) => {
				results.push(result);
			});

			await db.tasks.add({ id: "2", title: "Task 2", completed: false });
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(results).toHaveLength(1);

			unsubscribe();

			await db.tasks.add({ id: "3", title: "Task 3", completed: false });
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(results).toHaveLength(1); // No new notification

			query.dispose();
		});

		test("multiple subscribers all receive updates", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const results1: unknown[] = [];
			const results2: unknown[] = [];
			const query = db.query(async (q) => await q.tasks.getAll());

			query.subscribe((result) => results1.push(result));
			query.subscribe((result) => results2.push(result));

			await db.tasks.add({ id: "2", title: "Task 2", completed: false });
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(results1).toHaveLength(1);
			expect(results2).toHaveLength(1);

			query.dispose();
		});

		test("dispose stops all updates", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			let runCount = 0;
			const query = db.query(async (q) => {
				runCount++;
				return await q.tasks.getAll();
			});

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(runCount).toBe(1);

			query.dispose();

			await db.tasks.add({ id: "2", title: "Task 2", completed: false });
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(runCount).toBe(1); // Should not have re-run after dispose

			// Result should still be accessible but stale
			expect(query.result).toHaveLength(1);
		});

		test("throws when subscribing to disposed query", async () => {
			const db = await createTestDb();

			const query = db.query(async (q) => await q.tasks.getAll());
			query.dispose();

			expect(() => {
				query.subscribe(() => {});
			}).toThrow("Cannot subscribe to a disposed query");
		});

		test("dispose is idempotent", async () => {
			const db = await createTestDb();

			const query = db.query(async (q) => await q.tasks.getAll());

			// Should not throw when called multiple times
			query.dispose();
			query.dispose();
			query.dispose();
		});
	});

	describe("transaction integration", () => {
		test("re-runs after transaction commits", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			const query = db.query(async (q) => await q.tasks.getAll());

			// Wait for initial query to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result).toHaveLength(1);

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "2", title: "Task 2", completed: false });
				tx.tasks.add({ id: "3", title: "Task 3", completed: true });
			});

			// Wait for query to re-run
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(query.result).toHaveLength(3);

			query.dispose();
		});
	});
});
