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
// Plugins
export { type IdbPluginConfig, idbPlugin } from "./plugins/idb";
export {
	type HttpPluginConfig,
	type RequestContext,
	type RequestHookResult,
	type ResponseHookResult,
	httpPlugin,
} from "./plugins/http";
// Type utilities
export type { StandardSchemaV1 } from "./standard-schema";
// Transaction utilities
export type { TransactionContext } from "./transaction";

// Query system available as subpath export:
// import { createQuery } from "@byearlybird/starling-db/query"
