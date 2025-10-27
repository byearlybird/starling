import type { Query } from "@byearlybird/starling-plugins-query";
import { useEffect, useState } from "react";

export function useQueryResults<T extends Record<string, unknown>>(
	query: Query<T>,
): Map<string, T> {
	const [snapshot, setSnapshot] = useState(() => query.results());

	useEffect(() => {
		setSnapshot(query.results());

		const unsubscribe = query.onChange(() => {
			setSnapshot(query.results());
		});

		return unsubscribe;
	}, [query]);

	return snapshot;
}
