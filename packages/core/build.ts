import { build } from "tsdown";

export default build({
	entry: [
		"src/store/bundle.ts",
		"src/plugins/unstorage/plugin.ts",
		"src/crdt/index.ts",
		"src/db/bundle.ts",
	],
	minify: true,
});
