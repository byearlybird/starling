/**
 * Query system for reactive database queries.
 *
 * Provides single-collection and multi-collection query capabilities
 * with automatic dependency tracking and reactivity.
 */

import type { StandardSchemaV1 } from "../standard-schema";
import type { AnyObjectSchema } from "../types";
import type { CollectionAccessors } from "./collection-accessor";
import {
	type SingleCollectionQueryOptions,
	createSingleCollectionQuery,
} from "./single-collection-query";
import { createMultiCollectionQuery } from "./multi-collection-query";
import type { Query } from "./types";

type InferOutput<T> = T extends AnyObjectSchema
	? StandardSchemaV1.InferOutput<T>
	: never;

// Re-export types
export type { Query } from "./types";
export type { CollectionAccessors } from "./collection-accessor";

// ============================================================================
// Function Overloads
// ============================================================================

/**
 * Create a reactive query for a single collection.
 *
 * Mirrors the `collection.find()` API but with automatic reactivity.
 *
 * @example
 * ```typescript
 * const activeTodos = createQuery(db, "todos",
 *   (todo) => !todo.completed,
 *   {
 *     map: (todo) => todo.text,
 *     sort: (a, b) => a.localeCompare(b)
 *   }
 * );
 *
 * console.log(activeTodos.results()); // string[]
 * activeTodos.onChange(() => console.log("Changed!"));
 * activeTodos.dispose();
 * ```
 */
export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	K extends keyof Schemas,
	U = InferOutput<Schemas[K]>,
>(
	db: any,
	collectionKey: K,
	filter: (item: InferOutput<Schemas[K]>) => boolean,
	options?: SingleCollectionQueryOptions<InferOutput<Schemas[K]>, U>,
): Query<U>;

/**
 * Create a reactive query across multiple collections using a compute function.
 *
 * The compute function receives typed accessors for all collections and returns
 * the desired result array. The query automatically tracks which collections are
 * accessed and subscribes to their mutations.
 *
 * @example
 * ```typescript
 * const todosWithOwners = createQuery(db, (collections) => {
 *   const results = [];
 *   const todos = collections.todos.find(t => !t.completed);
 *   const users = collections.users.getAll();
 *
 *   for (const todo of todos) {
 *     const owner = users.find(u => u.id === todo.ownerId);
 *     if (owner) {
 *       results.push({
 *         id: todo.id,
 *         text: todo.text,
 *         ownerName: owner.name
 *       });
 *     }
 *   }
 *
 *   return results;
 * });
 * ```
 */
export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	Result,
>(
	db: any,
	compute: (collections: CollectionAccessors<Schemas>) => Result[],
): Query<Result>;

// ============================================================================
// Implementation
// ============================================================================

export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	K extends keyof Schemas,
	U,
	Result,
>(
	db: any,
	collectionKeyOrCompute:
		| K
		| ((collections: CollectionAccessors<Schemas>) => Result[]),
	filter?: (item: InferOutput<Schemas[K]>) => boolean,
	options?: SingleCollectionQueryOptions<InferOutput<Schemas[K]>, U>,
): Query<U> | Query<Result> {
	// Single-collection query
	if (typeof collectionKeyOrCompute === "string") {
		const collectionKey = collectionKeyOrCompute as K;
		const collectionHandle = db[collectionKey];

		if (!collectionHandle) {
			throw new Error(
				`Collection "${String(collectionKey)}" not found in database`,
			);
		}

		if (!filter) {
			throw new Error("Filter function is required for single-collection query");
		}

		return createSingleCollectionQuery(
			collectionHandle,
			filter,
			options,
		) as Query<U>;
	}

	// Multi-collection query
	const compute = collectionKeyOrCompute as (
		collections: CollectionAccessors<Schemas>,
	) => Result[];

	// Extract collection keys from database
	const collectionKeys = Object.keys(db).filter((key) => {
		// Skip database methods
		return (
			key !== "begin" &&
			key !== "toDocuments" &&
			key !== "on" &&
			key !== "init" &&
			key !== "dispose"
		);
	}) as (keyof Schemas)[];

	return createMultiCollectionQuery(db, collectionKeys, compute) as Query<Result>;
}
