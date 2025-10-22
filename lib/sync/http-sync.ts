import type { Store } from "../core";
import type { ArrayKV, EncodedObject } from "../core/types";

export type HttpConfig = {
	pullInterval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: ArrayKV<EncodedObject>,
	) => Promise<ArrayKV<EncodedObject>>;
	push: (data: ArrayKV<EncodedObject>) => Promise<void>;
	pull: () => Promise<ArrayKV<EncodedObject>>;
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
	const unwatch = store.on("change", async () => {
		if (started) {
			const latest = store.snapshot();

			if (latest.length > 0) {
				await pushData(latest);
			}
		}
	});

	async function pullData() {
		const data = await pull();
		const processed = preprocess ? await preprocess("pull", data) : data;
		store.merge(processed);
	}

	async function pushData(data: ArrayKV<EncodedObject>) {
		const processed = preprocess ? await preprocess("push", data) : data;
		await push(processed);
	}

	async function refresh() {
		await pullData();
		const latest = store.snapshot();

		if (latest.length > 0) {
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
