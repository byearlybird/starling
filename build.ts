/**
 * Unified build script using Bun's programmatic bundler API.
 * - Bundles JS/TS entrypoints to `dist/` as ESM targeting Node.
 * - Generates type declarations via `tsc --project tsconfig.build.json`.
 */

import { rmSync } from "node:fs";

const outdir = "dist";
const entrypoints = [
	"lib/core/index.ts",
	"lib/react/index.ts",
	"lib/solid/index.ts",
	"lib/plugins/index.ts",
];

async function buildJs() {
	console.info("[build] bundling entrypoints →", outdir);
	const result = await Bun.build({
		entrypoints,
		outdir,
		target: "browser",
		format: "esm",
		external: [
			// keep peer deps external to avoid bundling into the library output
			"react",
			"react-dom",
			"solid-js",
			"unstorage",
			"typescript",
		],
	});

	if (!result.success) {
		for (const log of result.logs) console.error(log.message);
		throw new Error("JS bundling failed");
	}
}

async function buildTypes() {
	console.info("[build] generating type declarations");
	// Use bunx to run the local TypeScript compiler
	await Bun.$`bunx tsc --project tsconfig.build.json`;
}

async function main() {
	// Clean previous build output
	rmSync(outdir, { recursive: true, force: true });

	await buildJs();
	await buildTypes();

	console.info("[build] done");
}

await main().catch((err) => {
	console.error("[build] error:", err?.message || err);
	process.exit(1);
});
