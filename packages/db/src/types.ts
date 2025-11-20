/**
 * Shared type definitions for the database package.
 */

import type { StandardSchemaV1 } from "./standard-schema";

/**
 * Any object schema type that can be used with collections.
 */
export type AnyObjectSchema<T extends Record<string, unknown> = Record<string, unknown>> = StandardSchemaV1<T>;
