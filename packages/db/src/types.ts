import type { AnyObject } from "@byearlybird/starling";
import type { StandardSchemaV1 } from "./standard-schema";

export type AnyObjectSchema<T extends AnyObject = AnyObject> =
        StandardSchemaV1<T>;
export type SchemasMap = Record<string, AnyObjectSchema>;
