import type { Store } from "@byearlybird/starling";
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
