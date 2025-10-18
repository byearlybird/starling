import type { Store } from "./store";
import type { EncodedRecord } from "./types";

export type MakeSynchronizedOptions = {
	setup?: Promise<void>;
	interval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: EncodedRecord,
	) => Promise<EncodedRecord>;
	send: (data: EncodedRecord) => Promise<void>;
	receive: () => Promise<EncodedRecord>;
};

export function makeSynchronized<TValue extends object>(
	store: Store<TValue>,
	{
		send,
		receive,
		preprocess,
		setup,
		interval = 1000 * 60 * 5, // 5 minutes
	}: MakeSynchronizedOptions,
) {
	let intervalId: Timer | null = null;

	const refresh = async () => {
		const data = await receive();
		const pulledAndProcessed = preprocess
			? await preprocess("pull", data)
			: data;
		await store.mergeState(pulledAndProcessed);
		const latest = await store.state();
		if (Object.keys(latest).length === 0) return;
		const latestProcessed = preprocess
			? await preprocess("push", latest)
			: latest;
		await send(latestProcessed);
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
