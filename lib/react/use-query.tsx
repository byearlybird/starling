import { useEffect, useRef, useState } from "react";
import type { Store } from "../core";
import { createQuery } from "../core";

export function useQuery<TValue extends object>(
	store: Store<TValue>,
	predicate: (data: TValue) => boolean,
) {
	const [isLoading, setIsLoading] = useState(true);
	const [data, setData] = useState<Record<string, TValue>>({});

	const queryRef = useRef(createQuery(store, predicate));

	useEffect(() => {
		const query = queryRef.current;

		query.load().then((data) => {
			setData(data);
			setIsLoading(false);
		});

		query.on("change", (results) => {
			setData(results);
		});

		return () => {
			query.dispose();
		};
	}, []);

	return { data, isLoading };
}
