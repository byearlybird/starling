/**
 * Type-safe database with schema validation and async persistence.
 *
 * Builds on top of Starling's CRDT infrastructure and adds:
 * - Schema validation using Standard Schema (Zod, Valibot, ArkType, etc.)
 * - Async persistence via Driver interface
 * - Property-based CRUD helpers keyed by resource type
 *
 * @example
 * ```ts
 * import { createDB } from "@byearlybird/starling/db";
 * import { z } from "zod";
 *
 * const taskSchema = z.object({
 *   id: z.string().uuid().default(() => crypto.randomUUID()),
 *   title: z.string(),
 *   completed: z.boolean().default(false),
 *   createdAt: z.string().datetime().default(() => new Date().toISOString()),
 * });
 *
 * const db = createDB({
 *   driver: new IdbDriver({ name: 'my-db' }),
 *   types: {
 *     task: {
 *       schema: taskSchema,
 *       getId: (task) => task.id,
 *     },
 *   },
 * });
 *
 * await db.init();
 *
 * const id = await db.task.add({ title: 'Learn Standard Schema' });
 * await db.task.update(id, { completed: true });
 * const task = await db.task.get(id);
 * const allTasks = await db.task.getAll();
 * await db.task.remove(id);
 * ```
 */

export { createDB, type DB } from "./db";
export { createMemoryDriver } from "./drivers";
export type {
	DBConfig,
	Driver,
	DriverState,
	InferInput,
	InferOutput,
	Schema,
	TypeConfig,
} from "./types";
export { ValidationError, validate } from "./validation";
