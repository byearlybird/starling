import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"lib/core/index.ts",
		"lib/plugins/index.ts",
	],
});
