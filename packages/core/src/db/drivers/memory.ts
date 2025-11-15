import type { Document } from "../../crdt";
import type { Driver, DriverState } from "../types";

/**
 * Factory for an in-memory driver used in testing and development.
 *
 * Persists the entire DB snapshot in a Map and returns it from {@link load}.
 * Data is lost when the process exits.
 */
export const createMemoryDriver = (): Driver => {
	const store = new Map<string, Document>();

	return {
		async load(): Promise<DriverState> {
			return Object.fromEntries(store);
		},
		async persist(state: DriverState): Promise<void> {
			store.clear();
			for (const [type, document] of Object.entries(state)) {
				store.set(type, document);
			}
		},
	};
};
