import type { Store } from "./store";
import type { EncodedRecord } from "./types";

export type MakeSynchronizedOptions = {
	setup?: Promise<void>;
	interval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: EncodedRecord,
	) => Promise<EncodedRecord>;
	push: (data: EncodedRecord) => Promise<void>;
	pull: () => Promise<EncodedRecord>;
};

export function makeSynchronized<TValue extends object>(
	store: Store<TValue>,
	{
		push,
		pull,
		preprocess,
		setup = Promise.resolve(),
		interval = 1000 * 60 * 5, // 5 minutes
	}: MakeSynchronizedOptions,
) {
	let intervalId: Timer | null = null;

	const refresh = async () => {
		const data = await pull();
		const pulledAndProcessed = preprocess
			? await preprocess("pull", data)
			: data;
		store.mergeState(pulledAndProcessed);
		const latest = store.state();
		if (Object.keys(latest).length === 0) return;
		const latestProcessed = preprocess
			? await preprocess("push", latest)
			: latest;
		await push(latestProcessed);
	};

	const init = (async () => {
		await setup;
		await refresh();
		// Start the interval after initial refresh
		intervalId = setInterval(refresh, interval);
	})();

	const dispose = () => {
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return {
		init,
		refresh,
		dispose,
	};
}
