import { build } from "tsdown";

export default build({
	entry: ["src/index.ts", "src/plugin-query.ts", "src/plugin-unstorage.ts"],
});
