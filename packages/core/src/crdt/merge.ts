import { isObject } from "./utils";

/**
 * Merge two attribute objects with their corresponding eventstamps using
 * field-level Last-Write-Wins semantics.
 *
 * Validates that the structure of attributes mirrors the structure of eventstamps
 * at each recursion level. Throws immediately on mismatch with full path info.
 *
 * @param attrsA - Base attributes object
 * @param eventsA - Eventstamps for base attributes (mirrors structure)
 * @param attrsB - Source attributes object to merge in
 * @param eventsB - Eventstamps for source attributes (mirrors structure)
 * @param path - Current path for error messages (used internally)
 * @returns Tuple of [merged attributes, merged eventstamps]
 * @throws Error if attributes and eventstamps structures don't match
 */
export function mergeAttributes(
	attrsA: Record<string, unknown>,
	eventsA: Record<string, unknown>,
	attrsB: Record<string, unknown>,
	eventsB: Record<string, unknown>,
	path = "",
): [Record<string, unknown>, Record<string, unknown>] {
	const merged: Record<string, unknown> = {};
	const mergedEvents: Record<string, unknown> = {};

	// Process all keys from attrsA
	for (const key in attrsA) {
		if (!Object.hasOwn(attrsA, key)) continue;

		const currentPath = path ? `${path}.${key}` : key;
		const valA = attrsA[key];
		const eventA = eventsA[key];
		const valB = attrsB[key];
		const eventB = eventsB[key];

		// Validate structure parity for attrsA
		const isObjA = isObject(valA);
		const isObjEventA = isObject(eventA);
		if (isObjA !== isObjEventA) {
			throw new Error(
				`Structure mismatch at "${currentPath}": ` +
					`attributes is ${isObjA ? "object" : "leaf"}, ` +
					`eventstamps is ${isObjEventA ? "object" : "leaf"}`,
			);
		}

		// Validate structure parity for attrsB if present
		if (valB !== undefined) {
			const isObjB = isObject(valB);
			const isObjEventB = isObject(eventB);
			if (isObjB !== isObjEventB) {
				throw new Error(
					`Structure mismatch at "${currentPath}": ` +
						`attributes is ${isObjB ? "object" : "leaf"}, ` +
						`eventstamps is ${isObjEventB ? "object" : "leaf"}`,
				);
			}
		}

		if (valB === undefined) {
			merged[key] = valA;
			mergedEvents[key] = eventA;
			continue;
		}

		const isObjB = isObject(valB);
		if (isObjA !== isObjB) {
			throw new Error(
				`Type mismatch at "${currentPath}": cannot change from ${isObjA ? "object" : "leaf"} to ${isObjB ? "object" : "leaf"}`,
			);
		}

		// Merge logic
		if (isObjA && isObjB) {
			// Both are nested objects - recurse
			const [mergedNested, mergedNestedEvents] = mergeAttributes(
				valA as Record<string, unknown>,
				eventA as Record<string, unknown>,
				valB as Record<string, unknown>,
				eventB as Record<string, unknown>,
				currentPath,
			);
			merged[key] = mergedNested;
			mergedEvents[key] = mergedNestedEvents;
		} else if (!isObjA && !isObjB) {
			// Both are leaves - compare eventstamps
			const eventAStr = eventA as string;
			const eventBStr = (eventB ?? "") as string;

			if (eventAStr > eventBStr) {
				merged[key] = valA;
				mergedEvents[key] = eventAStr;
			} else {
				merged[key] = valB;
				mergedEvents[key] = eventBStr;
			}
		}
	}

	// Process keys only in attrsB
	for (const key in attrsB) {
		if (!Object.hasOwn(attrsB, key) || Object.hasOwn(merged, key)) continue;

		const valB = attrsB[key];
		if (valB !== undefined) {
			merged[key] = valB;
			mergedEvents[key] = eventsB[key];
		}
	}

	return [merged, mergedEvents];
}
