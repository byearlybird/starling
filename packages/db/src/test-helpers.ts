import { makeDocument, makeResource } from "@byearlybird/starling";
import { z } from "zod";
import { createDatabase } from "./db";

// Shared schemas
export const taskSchema = z.object({
	id: z.string().default(() => crypto.randomUUID()),
	title: z.string(),
	completed: z.boolean(),
});

export const userSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

export type Task = z.infer<typeof taskSchema>;
export type User = z.infer<typeof userSchema>;

// Database factories
export function createTestDb() {
	return createDatabase("test-db", {
		tasks: {
			schema: taskSchema,
			getId: (task) => task.id,
		},
	});
}

export function createMultiCollectionDb() {
	return createDatabase("multi-collection-db", {
		tasks: {
			schema: taskSchema,
			getId: (task) => task.id,
		},
		users: {
			schema: userSchema,
			getId: (user) => user.id,
		},
	});
}

// Test data factories
export function makeTask(overrides: Partial<Task> = {}): Task & { id: string } {
	return {
		id: crypto.randomUUID(),
		title: "Test Task",
		completed: false,
		...overrides,
	};
}

export function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: crypto.randomUUID(),
		name: "Test User",
		email: "test@example.com",
		...overrides,
	};
}

// Document helpers for merge tests
export function makeTaskDocument(
	tasks: Array<{ id: string; title: string; completed: boolean }>,
	eventstamp = "2099-01-01T00:00:00.000Z|0001|a1b2",
) {
	const doc = makeDocument<Task>(eventstamp);
	for (const task of tasks) {
		doc.data.push(makeResource("tasks", task.id, task, eventstamp));
	}
	return doc;
}
