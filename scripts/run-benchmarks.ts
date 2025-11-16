#!/usr/bin/env bun
import { $ } from "bun";
import { readdirSync, statSync } from "fs";
import { join } from "path";

// ANSI color codes
const colors = {
	reset: "\x1b[0m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
};

// Find all .bench.ts files recursively
function findBenchmarkFiles(dir: string, fileList: string[] = []): string[] {
	const files = readdirSync(dir);

	for (const file of files) {
		const filePath = join(dir, file);
		const stat = statSync(filePath);

		if (stat.isDirectory()) {
			// Skip node_modules and dist directories
			if (!file.startsWith(".") && file !== "node_modules" && file !== "dist") {
				findBenchmarkFiles(filePath, fileList);
			}
		} else if (file.endsWith(".bench.ts")) {
			fileList.push(filePath);
		}
	}

	return fileList;
}

// Main execution
async function main() {
	console.log(
		`${colors.cyan}🔍 Searching for benchmark files...${colors.reset}\n`,
	);

	const benchmarkFiles = findBenchmarkFiles("packages/core");

	if (benchmarkFiles.length === 0) {
		console.log(`${colors.yellow}No benchmark files found.${colors.reset}`);
		process.exit(0);
	}

	console.log(
		`${colors.green}Found ${benchmarkFiles.length} benchmark file(s):${colors.reset}`,
	);
	for (const file of benchmarkFiles) {
		console.log(`  ${colors.blue}•${colors.reset} ${file}`);
	}
	console.log();

	// Run each benchmark sequentially
	for (let i = 0; i < benchmarkFiles.length; i++) {
		const file = benchmarkFiles[i];
		console.log(
			`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
		);
		console.log(
			`${colors.cyan}Running benchmark [${i + 1}/${benchmarkFiles.length}]:${colors.reset} ${file}`,
		);
		console.log(
			`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`,
		);

		try {
			await $`bun run --bun ${file}`;
			console.log();
		} catch (error) {
			console.error(
				`${colors.yellow}⚠ Benchmark failed: ${file}${colors.reset}`,
			);
			console.error(error);
			console.log();
		}
	}

	console.log(
		`${colors.green}✓ All benchmarks completed!${colors.reset}`,
	);
}

main().catch((error) => {
	console.error(`${colors.yellow}Error running benchmarks:${colors.reset}`, error);
	process.exit(1);
});
