import { build } from "tsdown";

export default build({
	entry: ["src/index.tsx"],
	tsconfig: "./tsconfig.json",
});
