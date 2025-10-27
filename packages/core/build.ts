import { build } from "tsdown";

export default build({
	entry: "src/index.ts",
	minify: true,
});
