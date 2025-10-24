import type { ArrayKV, EncodedObject } from "../../core/shared/types";
import type { Plugin } from "../../core/store/store";

type PushPullConfig = {
	push: (data: ArrayKV<EncodedObject>) => Promise<void>;
	pull: () => Promise<ArrayKV<EncodedObject>>;
	pullInterval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: ArrayKV<EncodedObject>,
	) => Promise<ArrayKV<EncodedObject>>;
	immediate?: boolean;
};

const pushPullPlugin = <TValue extends object>(
	config: PushPullConfig,
): Plugin<TValue> => {
	const {
		push,
		pull,
		preprocess,
		pullInterval = 1000 * 60 * 5, // 5 minutes
		immediate = true,
	} = config;

	const plugin: Plugin<TValue> = (store) => {
		let intervalId: Timer | null = null;
		let unwatch: (() => void) | null = null;

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
				unwatch = store.on("change", async () => {
					const latest = store.snapshot();

					if (latest.length > 0) {
						await pushData(latest);
					}
				});

				if (immediate) await pullData();

				intervalId = setInterval(pullData, pullInterval);
			},
			dispose: async () => {
				if (intervalId !== null) {
					clearInterval(intervalId);
					intervalId = null;
				}
				unwatch?.();
			},
		};
	};

	return plugin;
};

export { pushPullPlugin };
export type { PushPullConfig };
