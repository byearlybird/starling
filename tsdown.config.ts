import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"lib/core/index.ts",
		"lib/react/index.ts",
		"lib/solid/index.ts",
		"lib/plugins/index.ts",
	],
});
