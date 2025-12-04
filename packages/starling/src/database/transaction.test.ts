import { describe, expect, test } from "bun:test";
import { createMultiCollectionDb, createTestDb } from "./test-helpers";

describe("Transactions", () => {
	describe("commit", () => {
		test("commits changes on successful completion", async () => {
			const db = await createTestDb();

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Task 1", completed: false });
				tx.tasks.add({ id: "2", title: "Task 2", completed: false });
			});

			expect((await db.tasks.get("1"))?.title).toBe("Task 1");
			expect((await db.tasks.get("2"))?.title).toBe("Task 2");
		});

		test("returns callback result", async () => {
			const db = await createTestDb();

			const result = await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Test", completed: false });
				return "success";
			});

			expect(result).toBe("success");
			expect((await db.tasks.get("1"))?.title).toBe("Test");
		});

		test("commits changes across multiple collections", async () => {
			const db = await createMultiCollectionDb();

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Task 1", completed: false });
				tx.users.add({ id: "1", name: "Alice", email: "alice@example.com" });
			});

			expect((await db.tasks.get("1"))?.title).toBe("Task 1");
			expect((await db.users.get("1"))?.name).toBe("Alice");
		});
	});

	describe("rollback on error", () => {
		test("discards changes on exception", async () => {
			const db = await createTestDb();

			try {
				await db.begin(async (tx) => {
					tx.tasks.add({
						id: "1",
						title: "Should not persist",
						completed: false,
					});
					throw new Error("Transaction failed");
				});
			} catch {
				// Expected
			}

			expect(await db.tasks.get("1")).toBeNull();
		});

		test("rolls back all collections on error", async () => {
			const db = await createMultiCollectionDb();

			try {
				await db.begin(async (tx) => {
					tx.tasks.add({ id: "1", title: "Task 1", completed: false });
					tx.users.add({ id: "1", name: "Alice", email: "alice@example.com" });
					throw new Error("Rollback all");
				});
			} catch {
				// Expected
			}

			expect(await db.tasks.get("1")).toBeNull();
			expect(await db.users.get("1")).toBeNull();
		});

		test("prevents remove operation from persisting on error", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task to keep", completed: false });

			try {
				await db.begin(async (tx) => {
					tx.tasks.remove("1");
					throw new Error("Abort");
				});
			} catch {
				// Expected
			}

			expect((await db.tasks.get("1"))?.title).toBe("Task to keep");
		});
	});

	describe("isolation", () => {
		test("sees snapshot with read-your-writes", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Original", completed: false });

			await db.begin(async (tx) => {
				const task = await tx.tasks.get("1");
				expect(task?.title).toBe("Original");

				tx.tasks.update("1", { title: "Updated" });

				// Read-your-writes: should see the update within transaction
				const updatedTask = await tx.tasks.get("1");
				expect(updatedTask?.title).toBe("Updated");
			});

			expect((await db.tasks.get("1"))?.title).toBe("Updated");
		});

		test("supports chained operations on same resource", async () => {
			const db = await createTestDb();

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "New Task", completed: false });
				tx.tasks.update("1", { completed: true });
				tx.tasks.update("1", { title: "Modified Task" });

				const task = await tx.tasks.get("1");
				expect(task?.title).toBe("Modified Task");
				expect(task?.completed).toBe(true);
			});

			const task = await db.tasks.get("1");
			expect(task?.title).toBe("Modified Task");
			expect(task?.completed).toBe(true);
		});

		test("supports queries within transaction", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "1", title: "Task 1", completed: false });
			await db.tasks.add({ id: "2", title: "Task 2", completed: true });

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "3", title: "Task 3", completed: false });

				const incomplete = await tx.tasks.find((task) => !task.completed);
				expect(incomplete).toHaveLength(2);

				const all = await tx.tasks.getAll();
				expect(all).toHaveLength(3);
			});
		});
	});
});
