/**
 * Functional core for query operations.
 * All functions are pure and side-effect-free.
 */

/**
 * Apply filter predicate to items and return matching entries.
 */
export function filterItems<T>(
	items: ReadonlyArray<readonly [string, T]>,
	filter: (item: T) => boolean,
): Array<readonly [string, T]> {
	const result: Array<readonly [string, T]> = [];

	for (const [id, item] of items) {
		if (filter(item)) {
			result.push([id, item] as const);
		}
	}

	return result;
}

/**
 * Apply map function to items.
 */
export function mapItems<T, U>(
	items: ReadonlyArray<readonly [string, T]>,
	map: (item: T) => U,
): Array<readonly [string, U]> {
	return items.map(([id, item]) => [id, map(item)] as const);
}

/**
 * Apply sort comparator to items.
 */
export function sortItems<T>(
	items: Array<readonly [string, T]>,
	sort: (a: T, b: T) => number,
): Array<readonly [string, T]> {
	return items.sort(([, a], [, b]) => sort(a, b));
}

/**
 * Build an index from items.
 */
export function buildIndex<T, U>(
	items: Iterable<readonly [string, T]>,
	filter: (item: T) => boolean,
	map?: (item: T) => U,
): Map<string, U> {
	const index = new Map<string, U>();

	for (const [id, item] of items) {
		if (filter(item)) {
			const value = map ? map(item) : (item as unknown as U);
			index.set(id, value);
		}
	}

	return index;
}

/**
 * Update an index based on added items.
 * Returns a new Map and whether any changes occurred.
 */
export function applyAdds<T, U>(
	index: Map<string, U>,
	added: ReadonlyArray<{ id: string; item: T }>,
	filter: (item: T) => boolean,
	map?: (item: T) => U,
): { index: Map<string, U>; changed: boolean } {
	if (added.length === 0) {
		return { index, changed: false };
	}

	const newIndex = new Map(index);
	let changed = false;

	for (const { id, item } of added) {
		if (filter(item)) {
			const value = map ? map(item) : (item as unknown as U);
			newIndex.set(id, value);
			changed = true;
		}
	}

	return { index: newIndex, changed };
}

/**
 * Update an index based on updated items.
 * Returns a new Map and whether any changes occurred.
 */
export function applyUpdates<T, U>(
	index: Map<string, U>,
	updated: ReadonlyArray<{ id: string; before: T; after: T }>,
	filter: (item: T) => boolean,
	map?: (item: T) => U,
): { index: Map<string, U>; changed: boolean } {
	if (updated.length === 0) {
		return { index, changed: false };
	}

	const newIndex = new Map(index);
	let changed = false;

	for (const { id, after } of updated) {
		const matches = filter(after);
		const inIndex = index.has(id);

		if (matches && !inIndex) {
			// Item now matches - add it
			const value = map ? map(after) : (after as unknown as U);
			newIndex.set(id, value);
			changed = true;
		} else if (!matches && inIndex) {
			// Item no longer matches - remove it
			newIndex.delete(id);
			changed = true;
		} else if (matches && inIndex) {
			// Item still matches - update value
			const value = map ? map(after) : (after as unknown as U);
			newIndex.set(id, value);
			changed = true;
		}
	}

	return { index: newIndex, changed };
}

/**
 * Update an index based on removed items.
 * Returns a new Map and whether any changes occurred.
 */
export function applyRemovals<U>(
	index: Map<string, U>,
	removed: ReadonlyArray<{ id: string }>,
): { index: Map<string, U>; changed: boolean } {
	if (removed.length === 0) {
		return { index, changed: false };
	}

	const newIndex = new Map(index);
	let changed = false;

	for (const { id } of removed) {
		if (newIndex.delete(id)) {
			changed = true;
		}
	}

	return { index: newIndex, changed };
}

/**
 * Extract values from index as array.
 */
export function indexToArray<U>(index: Map<string, U>): U[] {
	return Array.from(index.values());
}

/**
 * Extract values from index as sorted array.
 */
export function indexToSortedArray<U>(
	index: Map<string, U>,
	sort: (a: U, b: U) => number,
): U[] {
	const array = Array.from(index.values());
	return array.sort(sort);
}
