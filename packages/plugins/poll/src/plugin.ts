import type { Document, Store } from "@byearlybird/starling";

type PollSyncConfig = {
	push: (data: Document.EncodedDocument[]) => Promise<void>;
	pull: () => Promise<Document.EncodedDocument[]>;
	pullInterval?: number;
	preprocess?: (
		event: "pull" | "push",
		data: Document.EncodedDocument[],
	) => Promise<Document.EncodedDocument[]>;
	immediate?: boolean;
};

const pollSyncPlugin = <TValue extends Record<string, unknown>>(
	config: PollSyncConfig,
): Store.Plugin<TValue> => {
	const {
		push,
		pull,
		preprocess,
		pullInterval = 1000 * 60 * 5, // 5 minutes
		immediate = true,
	} = config;

	return (store): Store.PluginHandle<TValue> => {
		let intervalId: Timer | null = null;
		let hasChanges = false;

		async function pullData() {
			const data = await pull();
			const processed = preprocess ? await preprocess("pull", data) : data;
			const tx = store.begin();
			for (const doc of processed) {
				tx.merge(doc);
			}
			tx.commit(); // not using silent, so that queries are alterted to changes
		}

		async function pushData() {
			if (!hasChanges) return;

			const snapshot = store.snapshot();
			const processed = preprocess
				? await preprocess("push", snapshot)
				: snapshot;
			await push(processed);

			hasChanges = false;
		}

		return {
			init: async () => {
				if (immediate) await pullData();

				intervalId = setInterval(pullData, pullInterval);
			},
			dispose: async () => {
				if (intervalId !== null) {
					clearInterval(intervalId);
					intervalId = null;
				}

				// Push any pending changes before disposing
				await pushData();
			},
			hooks: {
				onPut: async () => {
					hasChanges = true;
					await pushData();
				},
				onPatch: async () => {
					hasChanges = true;
					await pushData();
				},
				onDelete: async () => {
					hasChanges = true;
					await pushData();
				},
			},
		};
	};
};

export { pollSyncPlugin };
export type { PollSyncConfig };
