import type { Store } from "../core/store";
import type { EncodedRecord } from "../core/types";

export type HttpConfig = {
	pullInterval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: EncodedRecord,
	) => Promise<EncodedRecord>;
	push: (data: EncodedRecord) => Promise<void>;
	pull: () => Promise<EncodedRecord>;
};

export function createHttpSynchronizer<TValue extends object>(
	store: Store<TValue>,
	{
		push,
		pull,
		preprocess,
		pullInterval = 1000 * 60 * 5, // 5 minutes
	}: HttpConfig,
) {
	let started = false;
	let intervalId: Timer | null = null;
	const unwatch = store.on("mutate", async () => {
		if (started) {
			const latest = await store.state();
			if (Object.keys(latest).length > 0) {
				await pushData(latest);
			}
		}
	});

	async function pullData() {
		const data = await pull();
		const processed = preprocess ? await preprocess("pull", data) : data;
		await store.mergeState(processed);
	}

	async function pushData(data: EncodedRecord) {
		const processed = preprocess ? await preprocess("push", data) : data;
		await push(processed);
	}

	async function refresh() {
		await pullData();
		const latest = await store.state();

		if (Object.keys(latest).length > 0) {
			await pushData(latest);
		}
	}

	async function start() {
		if (started) return;
		started = true;
		await pullData();
		intervalId = setInterval(pullData, pullInterval);
	}

	function stop() {
		started = false;
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	function dispose() {
		stop();
		unwatch();
	}

	return {
		start,
		stop,
		refresh,
		dispose,
	};
}
