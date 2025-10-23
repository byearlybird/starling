import type { DependencyList } from "react";
import { useEffect, useRef, useState } from "react";
import type { Store } from "../core";
import { createQuery } from "../core";

export function useQuery<TValue extends object>(
	store: Store<TValue>,
	predicate: (data: TValue) => boolean,
	deps: DependencyList = [],
) {
	const [isLoading, setIsLoading] = useState(true);
	const [data, setData] = useState<Map<string, TValue>>(new Map());

	// Capture the latest predicate in a ref
	const predicateRef = useRef(predicate);
	predicateRef.current = predicate;

	useEffect(() => {
		// Create query inside effect so it's fresh on each mount
		const query = createQuery(store, (data) => predicateRef.current(data));

		const unsubscribe = query.onChange(() => {
			setData(query.results());
		});

		setData(query.results());
		setIsLoading(false);

		return () => {
			setIsLoading(true);
			unsubscribe();
			query.dispose();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [store, ...deps]);

	return { data, isLoading };
}
