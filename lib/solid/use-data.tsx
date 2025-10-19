import type { Store } from "@byearlybird/flock";
import { createResource, onCleanup } from "solid-js";

export function useData<T extends object>(store: Store<T>) {
	const [data, { refetch }] = createResource(store.values, {
		initialValue: {},
	});

	const unwatch = store.on("mutate", () => {
		refetch();
	});

	onCleanup(() => {
		unwatch();
	});

	return data;
}
