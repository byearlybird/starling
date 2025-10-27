import { $ } from "bun";

await Promise.all([
	$`cd apps/demo-starling-server && bun run dev`,
	$`cd apps/demo-starling-solid && bun run dev`,
]);
