import { build } from "tsdown";

export default build({
	entry: ["src/index.ts", "src/plugins/unstorage/plugin.ts"],
});
