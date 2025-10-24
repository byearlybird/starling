import type { Store } from "@core/store/store";
import { useEffect, useState } from "react";

export function useData<TValue extends object>(store: Store<TValue>) {
	const [isLoading, setIsLoading] = useState(true);
	const [data, setData] = useState<{ key: string; value: TValue }[]>([]);

	useEffect(() => {
		setData(store.values());

		const dispose = store.on("change", async () => {
			setData(store.values());
		});

		setIsLoading(false);

		return () => {
			setIsLoading(true);
			dispose();
		};
	}, [store]);

	return { data, isLoading };
}
