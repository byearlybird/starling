/**
 * @byearlybird/starling-db
 * Database utilities for Starling stores
 */

// Collection utilities
export {
	type Collection,
	DuplicateIdError,
	IdNotFoundError,
} from "./collection";
export { CollectionHandle } from "./collection-handle";
export type { CollectionConfig, DbConfig, Database } from "./db";

// Transaction utilities
export type { TransactionContext } from "./transaction";

// Core Database API
export { createDatabase } from "./db";

// Type utilities
export type { StandardSchemaV1 } from "./standard-schema";
