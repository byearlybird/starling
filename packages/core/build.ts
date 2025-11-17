import { build } from "tsdown";

export default build({
	entry: ["src/index.ts", "src/crdt/index.ts"],
});
