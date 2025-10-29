import type { Query } from "@byearlybird/starling-plugin-query";
import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";

export function createQuerySignal<T>(query: Query<T>): Accessor<Map<string, T>> {
	const [snapshot, setSnapshot] = createSignal(query.results());

	const unsubscribe = query.onChange(() => {
		setSnapshot(query.results());
	});

	onCleanup(unsubscribe);

	return snapshot;
}
