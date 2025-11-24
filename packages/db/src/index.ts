/**
 * @byearlybird/starling-db
 * Database utilities for Starling stores
 *
 * Plugins are available as separate optional imports:
 * - @byearlybird/starling-db/plugin-idb - IndexedDB persistence
 * - @byearlybird/starling-db/plugin-http - HTTP sync
 */

// Re-export core types from starling
export type { JsonDocument } from "@byearlybird/starling";

// Collection utilities
export {
	type Collection,
	CollectionInternals,
	DuplicateIdError,
	IdNotFoundError,
} from "./collection";
export type {
	CollectionConfig,
	Database,
	DatabasePlugin,
	DbConfig,
} from "./db";
// Core Database API
export { createDatabase } from "./db";
// Type utilities
export type { StandardSchemaV1 } from "./standard-schema";
// Transaction utilities
export type {
	TransactionCollectionHandle,
	TransactionContext,
} from "./transaction";
