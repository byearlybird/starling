import { build } from "tsdown";

export default build({
	entry: {
		index: "src/index.ts",
		core: "src/core/index.ts",
		"plugin-idb": "src/plugins/idb/index.ts",
		"plugin-http": "src/plugins/http/index.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	treeshake: true,
});
