import type { Store } from "@core/store/store";
import { createResource, onCleanup } from "solid-js";

export function useData<T extends object>(store: Store<T>) {
	const [data, { refetch }] = createResource(store.values, {
		initialValue: [],
	});

	const unwatch = store.on("change", () => {
		refetch();
	});

	onCleanup(() => {
		unwatch();
	});

	return data;
}
