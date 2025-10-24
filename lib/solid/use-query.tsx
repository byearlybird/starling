import type { Store } from "@core/store/store";
import { createEffect, createMemo, createResource, onCleanup } from "solid-js";

export function useQuery<T extends object>(
	store: Store<T>,
	predicate: (data: T) => boolean,
) {
	// Wrap in createMemo to track reactive dependencies in predicate
	const query = createMemo(() => store.query(predicate));

	// Use query as source signal - refetches automatically when query changes
	const [data, { refetch }] = createResource(query, (q) => q.results(), {
		initialValue: new Map(),
	});

	// Set up event listener that responds to data changes
	createEffect(() => {
		const currentQuery = query();

		const unsubscribe = currentQuery.onChange(() => {
			refetch();
		});

		// Clean up listener when query changes or component unmounts
		onCleanup(() => {
			unsubscribe();
			currentQuery.dispose();
		});
	});

	return data;
}
