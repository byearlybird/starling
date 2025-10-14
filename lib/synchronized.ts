import type { Data, Store } from "./store";

export function makeSynchronized<TValue extends object>(
	store: Store<TValue>,
	{
		push,
		pull,
		setup = Promise.resolve(),
		interval = 1000 * 60, // 1 minute
	}: {
		setup?: Promise<void>;
		interval?: number;
		push: (data: Data) => Promise<void>;
		pull: () => Promise<Data>;
	},
) {
	let intervalId: Timer | null = null;

	const refresh = async () => {
		const data = await pull();
		store.mergeState(data);
		const latest = store.state();
		if (Object.keys(latest).length === 0) return;
		await push(latest);
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
