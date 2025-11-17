import { MIN_EVENTSTAMP } from "../clock/eventstamp";
import { isObject } from "./utils";

function collectGreatestEventstamp(
	tree: Record<string, unknown>,
	fallback: string = MIN_EVENTSTAMP,
): string {
	let max = fallback;

	const visit = (node: unknown): void => {
		if (typeof node === "string") {
			if (node > max) {
				max = node;
			}
			return;
		}

		if (isObject(node)) {
			const obj = node as Record<string, unknown>;
			for (const key in obj) {
				if (!Object.hasOwn(obj, key)) continue;
				visit(obj[key]);
			}
		}
	};

	visit(tree);
	return max;
}

/**
 * Compute the latest eventstamp for a resource from its field eventstamps and deletedAt.
 * Used internally and exported for testing/validation.
 * @internal
 */
export function computeResourceLatest(
	eventstamps: Record<string, unknown>,
	deletedAt: string | null,
	fallback?: string,
): string {
	const dataLatest = collectGreatestEventstamp(
		eventstamps,
		fallback ?? MIN_EVENTSTAMP,
	);
	if (deletedAt && deletedAt > dataLatest) {
		return deletedAt;
	}
	return dataLatest;
}

/**
 * Resource object structure representing a single stored entity.
 * Resources are the primary unit of storage and synchronization in Starling.
 *
 * Each resource has a type, unique identifier, attributes containing the data,
 * and metadata for tracking deletion state and eventstamps.
 */
export type ResourceObject<T extends Record<string, unknown>> = {
	/** Resource type identifier */
	type: string;
	/** Unique identifier for this resource */
	id: string;
	/** The resource's data as a nested object structure */
	attributes: T;
	/** Metadata for tracking deletion and eventstamps */
	meta: {
		/** Mirrored structure containing eventstamps for each attribute field */
		eventstamps: Record<string, unknown>;
		/** The greatest eventstamp in this resource (including deletedAt if applicable) */
		latest: string;
		/** Eventstamp when this resource was soft-deleted, or null if not deleted */
		deletedAt: string | null;
	};
};

export function makeResource<T extends Record<string, unknown>>(
	type: string,
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): ResourceObject<T> {
	const attributes: Record<string, unknown> = {};
	const eventstamps: Record<string, unknown> = {};

	const step = (
		input: Record<string, unknown>,
		dataOutput: Record<string, unknown>,
		eventstampOutput: Record<string, unknown>,
	) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const value = input[key];

			if (isObject(value)) {
				// Nested object - recurse and create mirrored structure
				dataOutput[key] = {};
				eventstampOutput[key] = {};
				step(
					value as Record<string, unknown>,
					dataOutput[key] as Record<string, unknown>,
					eventstampOutput[key] as Record<string, unknown>,
				);
			} else {
				// Leaf value - store data and eventstamp separately
				dataOutput[key] = value;
				eventstampOutput[key] = eventstamp;
			}
		}
	};

	step(obj, attributes, eventstamps);

	const latest = computeResourceLatest(eventstamps, deletedAt, eventstamp);

	return {
		type,
		id,
		attributes: attributes as T,
		meta: {
			eventstamps,
			latest,
			deletedAt,
		},
	};
}

// TODO: consider if meta.eventstamps should be flat, with path : eventstamp
export function mergeResources<T extends Record<string, unknown>>(
	into: ResourceObject<T>,
	from: ResourceObject<T>,
): ResourceObject<T> {
	const resultData: Record<string, unknown> = {};
	const resultEventstamps: Record<string, unknown> = {};

	const step = (
		d1: Record<string, unknown>,
		e1: Record<string, unknown>,
		d2: Record<string, unknown>,
		e2: Record<string, unknown>,
		dataOutput: Record<string, unknown>,
		eventstampOutput: Record<string, unknown>,
		path: string = "",
	) => {
		// Collect all keys from both objects
		const allKeys = new Set([...Object.keys(d1), ...Object.keys(d2)]);

		for (const key of allKeys) {
			const value1 = d1[key];
			const value2 = d2[key];
			const stamp1 = e1[key];
			const stamp2 = e2[key];
			const fieldPath = path ? `${path}.${key}` : key;

			// Both have this key
			if (value1 !== undefined && value2 !== undefined) {
				// Both are objects - need to recurse
				if (
					isObject(value1) &&
					isObject(value2) &&
					isObject(stamp1) &&
					isObject(stamp2)
				) {
					dataOutput[key] = {};
					eventstampOutput[key] = {};
					step(
						value1 as Record<string, unknown>,
						stamp1 as Record<string, unknown>,
						value2 as Record<string, unknown>,
						stamp2 as Record<string, unknown>,
						dataOutput[key] as Record<string, unknown>,
						eventstampOutput[key] as Record<string, unknown>,
						fieldPath,
					);
				} else if (typeof stamp1 === "string" && typeof stamp2 === "string") {
					// Both are leaf values - compare eventstamps
					if (stamp1 > stamp2) {
						dataOutput[key] = value1;
						eventstampOutput[key] = stamp1;
					} else {
						dataOutput[key] = value2;
						eventstampOutput[key] = stamp2;
					}
				} else {
					// Schema mismatch: one is object, other is primitive
					throw new Error(
						`Schema mismatch at field '${fieldPath}': cannot merge object with primitive`,
					);
				}
			} else if (value1 !== undefined) {
				// Only in first record
				dataOutput[key] = value1;
				eventstampOutput[key] = stamp1;
			} else if (value2 !== undefined) {
				// Only in second record
				dataOutput[key] = value2;
				eventstampOutput[key] = stamp2;
			}
		}
	};

	step(
		into.attributes,
		into.meta.eventstamps,
		from.attributes,
		from.meta.eventstamps,
		resultData,
		resultEventstamps,
	);

	// Use the cached latest values from both records
	const baseLatest =
		into.meta.latest > from.meta.latest ? into.meta.latest : from.meta.latest;
	const dataLatest = computeResourceLatest(resultEventstamps, null, baseLatest);

	const mergedDeletedAt =
		into.meta.deletedAt && from.meta.deletedAt
			? into.meta.deletedAt > from.meta.deletedAt
				? into.meta.deletedAt
				: from.meta.deletedAt
			: into.meta.deletedAt || from.meta.deletedAt || null;

	// Calculate the greatest eventstamp from data and deletion timestamp
	const finalLatest =
		mergedDeletedAt && mergedDeletedAt > dataLatest
			? mergedDeletedAt
			: dataLatest;

	return {
		type: into.type,
		id: into.id,
		attributes: resultData as T,
		meta: {
			eventstamps: resultEventstamps,
			latest: finalLatest,
			deletedAt: mergedDeletedAt,
		},
	};
}

export function deleteResource<T extends Record<string, unknown>>(
	resource: ResourceObject<T>,
	eventstamp: string,
): ResourceObject<T> {
	// If resource isn't already deleted, meta.latest already contains the data's max eventstamp
	const dataLatest = resource.meta.deletedAt
		? computeResourceLatest(resource.meta.eventstamps, null)
		: resource.meta.latest;
	const latest = eventstamp > dataLatest ? eventstamp : dataLatest;

	return {
		type: resource.type,
		id: resource.id,
		attributes: resource.attributes,
		meta: {
			eventstamps: resource.meta.eventstamps,
			latest,
			deletedAt: eventstamp,
		},
	};
}
