import { type AnyObject, Clock } from "@byearlybird/starling";
import { createCollection } from "./collection";
import {
	type CollectionHandle,
	createCollectionHandle,
} from "./collection-handle";
import type { StandardSchemaV1 } from "./standard-schema";

type AnyObjectSchema<T extends AnyObject = AnyObject> = StandardSchemaV1<T>;

export type CollectionConfig<T extends AnyObjectSchema> = {
	schema: T;
	getId: (item: StandardSchemaV1.InferOutput<T>) => string;
};

export type DbConfig<Schemas extends Record<string, AnyObjectSchema>> = {
	schema: {
		[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
	};
};

/**
 * Create a typed database instance with collection access.
 * @param config - Database configuration with schema definitions
 * @returns A database instance with typed collection properties
 *
 * @example
 * ```typescript
 * const db = createDatabase({
 *   schema: {
 *     tasks: { schema: taskSchema, getId: (task) => task.id },
 *   }
 * });
 *
 * const task = db.tasks.add({ title: 'Learn Starling' });
 * ```
 */
export function createDatabase<Schemas extends Record<string, AnyObjectSchema>>(
	config: DbConfig<Schemas>,
): { [K in keyof Schemas]: CollectionHandle<Schemas[K]> } {
	const clock = new Clock();
	const collections = makeHandles(config.schema, () => clock.now());

	return collections;
}

function makeHandles<Schemas extends Record<string, AnyObjectSchema>>(
	configs: {
		[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
	},
	getEventstamp: () => string,
): { [K in keyof Schemas]: CollectionHandle<Schemas[K]> } {
	const collections = {} as {
		[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
	};

	for (const name of Object.keys(configs) as (keyof Schemas)[]) {
		const config = configs[name];
		const collection = createCollection(
			name as string,
			config.schema,
			config.getId,
			getEventstamp,
		);
		collections[name] = createCollectionHandle(collection);
	}

	return collections;
}
