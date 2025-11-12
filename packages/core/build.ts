import { build } from "tsdown";

export default build({
	entry: [
		"src/index.ts",
		"src/plugins/unstorage/plugin.ts",
		"src/crdt/index.ts",
		"src/store-lite.ts",
		"src/adapter.ts",
		"src/adapters/memory.ts",
	],
});
