/**
 * Query system for reactive database queries.
 *
 * Provides reactive queries with automatic dependency tracking.
 * Works across single or multiple collections.
 */

import type { AnyObjectSchema } from "../types";
import type { CollectionAccessors } from "./collection-accessor";
import { createMultiCollectionQuery } from "./multi-collection-query";
import type { Query } from "./types";

// Re-export types
export type { Query } from "./types";
export type { CollectionAccessors } from "./collection-accessor";

/**
 * Create a reactive query using a compute function.
 *
 * The compute function receives typed accessors for all collections and returns
 * the desired result array. The query automatically tracks which collections are
 * accessed and subscribes to their mutations.
 *
 * @example
 * Single collection:
 * ```typescript
 * const activeTodos = createQuery(db, (collections) => {
 *   return collections.todos.find(t => !t.completed);
 * });
 * ```
 *
 * @example
 * Multiple collections:
 * ```typescript
 * const todosWithOwners = createQuery(db, (collections) => {
 *   const todos = collections.todos.find(t => !t.completed);
 *   const users = collections.users.getAll();
 *
 *   const userMap = new Map(users.map(u => [u.id, u]));
 *
 *   return todos.map(todo => ({
 *     ...todo,
 *     ownerName: userMap.get(todo.ownerId)?.name
 *   }));
 * });
 * ```
 *
 * @example
 * With map and sort:
 * ```typescript
 * const todoTexts = createQuery(db, (collections) => {
 *   return collections.todos
 *     .find(t => !t.completed)
 *     .map(t => t.text)
 *     .sort((a, b) => a.localeCompare(b));
 * });
 * ```
 */
export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	Result,
>(
	db: any,
	compute: (collections: CollectionAccessors<Schemas>) => Result[],
): Query<Result> {
	return createMultiCollectionQuery(db, compute);
}
