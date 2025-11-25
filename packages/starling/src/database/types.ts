import type { AnyObject } from "../core";
import type { StandardSchemaV1 } from "./standard-schema";

export type AnyObjectSchema<T extends AnyObject = AnyObject> =
	StandardSchemaV1<T>;
export type SchemasMap = Record<string, AnyObjectSchema>;
