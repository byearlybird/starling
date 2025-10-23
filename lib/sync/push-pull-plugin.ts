import type { Plugin } from "../core/store";
import type { ArrayKV, EncodedObject } from "../core/types";

type PushPullConfig = {
	pullInterval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: ArrayKV<EncodedObject>,
	) => Promise<ArrayKV<EncodedObject>>;
	push: (data: ArrayKV<EncodedObject>) => Promise<void>;
	pull: () => Promise<ArrayKV<EncodedObject>>;
};

const pushPullPlugin = (config: PushPullConfig): Plugin => {
	const {
		push,
		pull,
		preprocess,
		pullInterval = 1000 * 60 * 5, // 5 minutes
	} = config;

	const plugin: Plugin = (store) => {
		let intervalId: Timer | null = null;
		let isInitialized = false;

		const unwatch = store.on("change", async () => {
			if (!isInitialized) return;

			const latest = store.snapshot();

			if (latest.length > 0) {
				await pushData(latest);
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

		return {
			init: async () => {
				await pullData();
				isInitialized = true;
				intervalId = setInterval(pullData, pullInterval);
			},
			dispose: async () => {
				isInitialized = false;
				if (intervalId !== null) {
					clearInterval(intervalId);
					intervalId = null;
				}
				unwatch();
			},
		};
	};

	return plugin;
};

export { pushPullPlugin };
export type { PushPullConfig };
