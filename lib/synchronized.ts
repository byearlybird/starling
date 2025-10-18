import type { Store } from "./store";
import type { EncodedRecord } from "./types";

export type MakeSynchronizedOptions = {
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
		interval = 1000 * 60 * 5, // 5 minutes
	}: MakeSynchronizedOptions,
) {
	let intervalId: Timer | null = setInterval(refresh, interval);

	async function refresh() {
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
	}

	function dispose() {
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	return {
		refresh,
		dispose,
	};
}
