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
export {
	type HttpPluginConfig,
	httpPlugin,
	type RequestContext,
	type RequestHookResult,
	type ResponseHookResult,
} from "./plugins/http";
// Plugins
export { type IdbPluginConfig, idbPlugin } from "./plugins/idb";
// Type utilities
export type { StandardSchemaV1 } from "./standard-schema";
// Transaction utilities
export type { TransactionContext } from "./transaction";
