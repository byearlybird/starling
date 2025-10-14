import { describe, expect, mock, test } from "bun:test";
import memoryDriver from "unstorage/drivers/memory";
import { z } from "zod";
import { Flock } from "../lib/flock";
import { createFlockState } from "../lib/flock-mitt";

describe("Flock integration tests", () => {
	test("insert, get, and update a task", async () => {
		const flock = createFlockState<{ name: string }>();
		flock.insert("123", { name: "One" });
		let results: any = null;
		console.time("testrun");
		flock.query(
			"query",
			() => true,
			(queryResults) => {
				console.timeEnd("testrun");
				results = queryResults;
			},
		);

		expect(results).not.toBeNull();
		console.log(results.get("123"));
	});
});
