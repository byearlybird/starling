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
export type { TransactionContext } from "./transaction";

// Plugins
export { idbPlugin, type IdbPluginConfig } from "./plugins/idb";
