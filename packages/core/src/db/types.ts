import type { Document } from "../crdt";
import type { StandardSchemaV1 } from "./standard-schema";

/**
 * Standard Schema type alias constrained to record-shaped data.
 */
export type Schema<
	Input = Record<string, unknown>,
	Output = Input,
> = StandardSchemaV1<Input, Output>;

export type AnySchema = Schema<any, any>;

export type SchemaInput<S extends AnySchema> = StandardSchemaV1.InferInput<S>;
export type SchemaOutput<S extends AnySchema> = StandardSchemaV1.InferOutput<S>;

/**
 * Configuration for a specific resource type.
 * @template S - The Standard Schema validator
 */
export type TypeConfig<S extends AnySchema> = {
	/** Standard Schema-compliant validator (Zod, Valibot, ArkType, etc.) */
	schema: S;
	/** Extract the ID from a validated resource */
	getId: (data: SchemaOutput<S>) => string;
};

export type TypeConfigs = Record<string, TypeConfig<AnySchema>>;

/**
 * Serialized representation of the database grouped by resource type.
 * Keys are type names, values are JSON:API documents containing the
 * corresponding resources plus document-level metadata.
 */
export type DriverState = Record<string, Document>;

/**
 * Driver interface that persists and hydrates the full DB state.
 */
export interface Driver {
	/**
	 * Load the full persisted state into memory.
	 * Should be called after {@link init} completes.
	 */
	load(): Promise<DriverState>;
	/** Persist the full state as a single unit (e.g., write one file). */
	persist(state: DriverState): Promise<void>;
	/** Optional initialization hook called when DB starts */
	init?(): Promise<void>;
	/** Optional cleanup hook called when DB shuts down */
	dispose?(): Promise<void>;
}

/**
 * Configuration for creating a DB instance.
 * @template Types - Record of resource type names to their configs
 */
export type DBConfig<Types extends Record<string, TypeConfig<AnySchema>>> = {
	/** Async driver for persistence */
	driver: Driver;
	/** Resource type configurations */
	types: Types;
};

/**
 * Re-export Standard Schema type inference utilities for convenience.
 */
export type InferInput<S extends Schema> = StandardSchemaV1.InferInput<S>;
export type InferOutput<S extends Schema> = StandardSchemaV1.InferOutput<S>;
