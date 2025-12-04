/**
 * @byearlybird/starling
 * Local-first data sync for JavaScript apps
 *
 * Main export: Database with typed collections, transactions, and IDB-backed storage.
 * For low-level CRDT primitives, import from "@byearlybird/starling/core"
 *
 * HTTP sync plugin available as optional import:
 * - @byearlybird/starling/plugin-http - HTTP sync
 */

// Re-export commonly needed core types
export type { JsonDocument, AnyObject } from "./core";

// Database features
export { createDatabase } from "./database/db";
export type {
	Database,
	DbConfig,
	CollectionConfig,
} from "./database/db";

export {
	type IDBCollection as Collection,
	DuplicateIdError,
	IdNotFoundError,
} from "./database/idb-collection";

export type {
	TransactionContext,
	TransactionCollectionHandle,
} from "./database/transaction";

export type {
	QueryContext,
	QueryHandle,
	QueryCollectionHandle,
} from "./database/query";

export type { StandardSchemaV1 } from "./database/standard-schema";
