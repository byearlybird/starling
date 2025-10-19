import { createQuery, type Store } from "@byearlybird/starling";
import { createResource, onCleanup } from "solid-js";

export function useQuery<T extends object>(
	store: Store<T>,
	predicate: (data: T) => boolean,
) {
	const query = createQuery(store, predicate);
	const [data, { refetch, mutate }] = createResource(query.load, {
		initialValue: {},
	});

	query.on("change", (data) => {
		mutate(data);
		refetch();
	});

	onCleanup(() => {
		query.dispose();
	});

	return data;
}
