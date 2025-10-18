import { useEffect, useState } from "react";
import type { Store } from "../store";

export function useData<TValue extends object>(store: Store<TValue>) {
	const [isLoading, setIsLoading] = useState(true);
	const [data, setData] = useState<Record<string, TValue>>({});

	useEffect(() => {
		const load = async () => {
			const values = await store.values();
			setData(values);
			setIsLoading(false);
		};

		const dispose = store.on("mutate", async () => {
			setData(await store.values());
		});

		load();

		return () => {
			dispose();
		};
	}, [store]);

	return { data, isLoading };
}
