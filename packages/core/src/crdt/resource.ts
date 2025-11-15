import { mergeAttributes } from "./merge";
import { isObject } from "./utils";

/**
 * Resource object representing a document with versioned data and separated eventstamps.
 *
 * Resource objects are the primary unit of storage and synchronization in Starling.
 * Attributes contain plain data, while meta.~eventstamps mirrors the structure
 * of attributes to track when each field was last written.
 *
 * This format is used consistently across disk storage, sync messages,
 * network transport, and export/import operations.
 *
 * Attributes must be an object (not a primitive).
 *
 * @see https://jsonapi.org/format/#document-resource-objects
 */
export type ResourceObject = {
	/** Resource type identifier (collection name) */
	type: string;
	/** Unique identifier for this resource */
	id: string;
	/** The resource's plain data (must be an object) */
	attributes: Record<string, unknown>;
	/** System metadata including eventstamps and deletion marker */
	meta: {
		/** Eventstamps for each field, mirroring attributes structure */
		"~eventstamps": Record<string, unknown>;
		/** Eventstamp when this resource was soft-deleted, or null if not deleted */
		"~deletedAt": string | null;
	};
};

/**
 * Create eventstamps structure that mirrors a plain object's structure.
 * Each leaf value gets the provided eventstamp.
 *
 * @param value - Plain object to create eventstamps for
 * @param eventstamp - Timestamp to assign to all leaves
 * @returns Tuple of [attributes (same as value), eventstamps (mirrored structure)]
 * @throws Error if value is not an object
 */
export function addEventstamps(
	value: unknown,
	eventstamp: string,
): [Record<string, unknown>, Record<string, unknown>] {
	if (!isObject(value)) {
		throw new Error("Attributes must be an object (not a primitive)");
	}

	const attributes: Record<string, unknown> = {};
	const eventstamps: Record<string, unknown> = {};

	const step = (
		input: Record<string, unknown>,
		attrs: Record<string, unknown>,
		events: Record<string, unknown>,
	) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const val = input[key];

			if (isObject(val)) {
				attrs[key] = {};
				events[key] = {};
				step(
					val as Record<string, unknown>,
					attrs[key] as Record<string, unknown>,
					events[key] as Record<string, unknown>,
				);
			} else {
				attrs[key] = val;
				events[key] = eventstamp;
			}
		}
	};

	step(value as Record<string, unknown>, attributes, eventstamps);
	return [attributes, eventstamps];
}

/**
 * Decode a JSON:API resource object back into a plain JavaScript object.
 *
 * @param resource - Resource object to decode
 * @returns Decoded object with type, id, data, and metadata
 */
export function decodeResource<T extends Record<string, unknown>>(
	resource: ResourceObject,
): {
	type: string;
	id: string;
	data: T;
	meta: {
		"~deletedAt": string | null;
	};
} {
	const data: Record<string, unknown> = {};

	const step = (
		attrs: Record<string, unknown>,
		output: Record<string, unknown>,
	) => {
		for (const key in attrs) {
			if (!Object.hasOwn(attrs, key)) continue;

			const val = attrs[key];

			if (isObject(val)) {
				output[key] = {};
				step(
					val as Record<string, unknown>,
					output[key] as Record<string, unknown>,
				);
			} else {
				output[key] = val;
			}
		}
	};

	step(resource.attributes, data);

	return {
		type: resource.type,
		id: resource.id,
		data: data as T,
		meta: {
			"~deletedAt": resource.meta["~deletedAt"],
		},
	};
}

/**
 * Merge two JSON:API resource objects using field-level Last-Write-Wins.
 *
 * Attributes are merged using field-level LWW semantics, with eventstamps
 * determining which value wins for each field. Deletion is handled separately
 * by comparing eventstamps.
 *
 * @param into - Base resource object
 * @param from - Source resource object to merge in
 * @returns Tuple of [merged resource object, greatest eventstamp]
 * @throws Error if structure of attributes and eventstamps doesn't match
 */
export function mergeResources(
	into: ResourceObject,
	from: ResourceObject,
): [ResourceObject, string] {
	// Merge attributes and eventstamps together
	const [mergedAttrs, mergedEvents] = mergeAttributes(
		into.attributes,
		into.meta["~eventstamps"],
		from.attributes,
		from.meta["~eventstamps"],
	);

	// Merge deletion timestamp using LWW
	const intoDeleted = into.meta["~deletedAt"];
	const fromDeleted = from.meta["~deletedAt"];

	let mergedDeletedAt: string | null = null;
	let deletedEventstamp = "";

	if (intoDeleted && fromDeleted) {
		if (intoDeleted > fromDeleted) {
			mergedDeletedAt = intoDeleted;
			deletedEventstamp = intoDeleted;
		} else {
			mergedDeletedAt = fromDeleted;
			deletedEventstamp = fromDeleted;
		}
	} else if (intoDeleted) {
		mergedDeletedAt = intoDeleted;
		deletedEventstamp = intoDeleted;
	} else if (fromDeleted) {
		mergedDeletedAt = fromDeleted;
		deletedEventstamp = fromDeleted;
	}

	// Find greatest eventstamp from both attributes and deletion
	let greatestEventstamp = "";

	// Find max eventstamp from merged events
	const findMaxEventstamp = (events: Record<string, unknown>): string => {
		let max = "";
		for (const key in events) {
			const val = events[key];
			if (typeof val === "string") {
				if (val > max) max = val;
			} else if (isObject(val)) {
				const nested = findMaxEventstamp(val as Record<string, unknown>);
				if (nested > max) max = nested;
			}
		}
		return max;
	};

	const attrsMax = findMaxEventstamp(mergedEvents);
	greatestEventstamp = attrsMax;

	if (deletedEventstamp > greatestEventstamp) {
		greatestEventstamp = deletedEventstamp;
	}

	return [
		{
			type: into.type,
			id: into.id,
			attributes: mergedAttrs,
			meta: {
				"~eventstamps": mergedEvents,
				"~deletedAt": mergedDeletedAt,
			},
		},
		greatestEventstamp,
	];
}

/**
 * Mark a JSON:API resource object as soft-deleted.
 *
 * @param resource - Resource object to delete
 * @param eventstamp - Deletion timestamp
 * @returns Resource object marked with deletion timestamp
 */
export function deleteResource(
	resource: ResourceObject,
	eventstamp: string,
): ResourceObject {
	return {
		type: resource.type,
		id: resource.id,
		attributes: resource.attributes,
		meta: {
			"~eventstamps": resource.meta["~eventstamps"],
			"~deletedAt": eventstamp,
		},
	};
}

export function createResource(
	type: string,
	id: string,
	data: Record<string, unknown>,
	eventstamp: string,
	deletedAt: string | null = null,
): ResourceObject {
	const [attributes, eventstamps] = addEventstamps(data, eventstamp);
	return {
		type,
		id,
		attributes,
		meta: { "~eventstamps": eventstamps, "~deletedAt": deletedAt },
	};
}
