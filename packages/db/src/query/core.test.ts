import { describe, expect, it } from "bun:test";
import {
	applyAdds,
	applyRemovals,
	applyUpdates,
	buildIndex,
	filterItems,
	indexToArray,
	indexToSortedArray,
	mapItems,
	sortItems,
} from "./core";

describe("Query Core (Functional)", () => {
	describe("filterItems", () => {
		it("filters items by predicate", () => {
			const items: Array<readonly [string, { completed: boolean }]> = [
				["1", { completed: false }],
				["2", { completed: true }],
				["3", { completed: false }],
			];

			const result = filterItems(items, (item) => !item.completed);

			expect(result).toEqual([
				["1", { completed: false }],
				["3", { completed: false }],
			]);
		});
	});

	describe("mapItems", () => {
		it("maps items to new values", () => {
			const items: Array<readonly [string, { text: string }]> = [
				["1", { text: "Hello" }],
				["2", { text: "World" }],
			];

			const result = mapItems(items, (item) => item.text);

			expect(result).toEqual([
				["1", "Hello"],
				["2", "World"],
			]);
		});
	});

	describe("sortItems", () => {
		it("sorts items by comparator", () => {
			const items: Array<readonly [string, string]> = [
				["1", "Zebra"],
				["2", "Apple"],
				["3", "Mango"],
			];

			const result = sortItems(items, (a, b) => a.localeCompare(b));

			expect(result).toEqual([
				["2", "Apple"],
				["3", "Mango"],
				["1", "Zebra"],
			]);
		});
	});

	describe("buildIndex", () => {
		it("builds index from items", () => {
			type Item = { id: string; completed: boolean };
			const items: Array<readonly [string, Item]> = [
				["1", { id: "1", completed: false }],
				["2", { id: "2", completed: true }],
				["3", { id: "3", completed: false }],
			];

			const index = buildIndex(
				items,
				(item) => !item.completed,
			);

			expect(index.size).toBe(2);
			expect(index.get("1")).toEqual({ id: "1", completed: false });
			expect(index.get("3")).toEqual({ id: "3", completed: false });
		});

		it("builds index with map function", () => {
			type Item = { id: string; text: string };
			const items: Array<readonly [string, Item]> = [
				["1", { id: "1", text: "Hello" }],
				["2", { id: "2", text: "World" }],
			];

			const index = buildIndex(
				items,
				() => true,
				(item) => item.text,
			);

			expect(index.size).toBe(2);
			expect(index.get("1")).toBe("Hello");
			expect(index.get("2")).toBe("World");
		});
	});

	describe("applyAdds", () => {
		it("adds matching items to index", () => {
			const index = new Map<string, string>();
			const added = [
				{ id: "1", item: { text: "Hello", completed: false } },
				{ id: "2", item: { text: "World", completed: true } },
			];

			const result = applyAdds(
				index,
				added,
				(item) => !item.completed,
				(item) => item.text,
			);

			expect(result.changed).toBe(true);
			expect(result.index.size).toBe(1);
			expect(result.index.get("1")).toBe("Hello");
		});

		it("returns unchanged when no matching adds", () => {
			const index = new Map<string, string>();
			const added = [{ id: "1", item: { text: "Hello", completed: true } }];

			const result = applyAdds(
				index,
				added,
				(item) => !item.completed,
			);

			expect(result.changed).toBe(false);
			expect(result.index).toBe(index); // Same reference
		});
	});

	describe("applyUpdates", () => {
		it("adds items that now match", () => {
			const index = new Map<string, { text: string }>();
			const updated = [
				{
					id: "1",
					before: { text: "Hello", completed: true },
					after: { text: "Hello", completed: false },
				},
			];

			const result = applyUpdates(
				index,
				updated,
				(item) => !item.completed,
			);

			expect(result.changed).toBe(true);
			expect(result.index.has("1")).toBe(true);
		});

		it("removes items that no longer match", () => {
			const index = new Map([["1", { text: "Hello", completed: false }]]);
			const updated = [
				{
					id: "1",
					before: { text: "Hello", completed: false },
					after: { text: "Hello", completed: true },
				},
			];

			const result = applyUpdates(
				index,
				updated,
				(item) => !item.completed,
			);

			expect(result.changed).toBe(true);
			expect(result.index.has("1")).toBe(false);
		});

		it("updates items that still match", () => {
			const index = new Map([["1", "Hello"]]);
			const updated = [
				{
					id: "1",
					before: { text: "Hello", completed: false },
					after: { text: "Updated", completed: false },
				},
			];

			const result = applyUpdates(
				index,
				updated,
				(item) => !item.completed,
				(item) => item.text,
			);

			expect(result.changed).toBe(true);
			expect(result.index.get("1")).toBe("Updated");
		});
	});

	describe("applyRemovals", () => {
		it("removes items from index", () => {
			const index = new Map([
				["1", "Hello"],
				["2", "World"],
			]);
			const removed = [{ id: "1" }];

			const result = applyRemovals(index, removed);

			expect(result.changed).toBe(true);
			expect(result.index.size).toBe(1);
			expect(result.index.has("1")).toBe(false);
			expect(result.index.has("2")).toBe(true);
		});

		it("returns unchanged when removing non-existent items", () => {
			const index = new Map([["1", "Hello"]]);
			const removed = [{ id: "2" }];

			const result = applyRemovals(index, removed);

			expect(result.changed).toBe(false);
			expect(result.index).toBe(index); // Same reference
		});
	});

	describe("indexToArray", () => {
		it("converts index to array of values", () => {
			const index = new Map([
				["1", "Hello"],
				["2", "World"],
			]);

			const result = indexToArray(index);

			expect(result).toEqual(["Hello", "World"]);
		});
	});

	describe("indexToSortedArray", () => {
		it("converts index to sorted array", () => {
			const index = new Map([
				["1", "Zebra"],
				["2", "Apple"],
				["3", "Mango"],
			]);

			const result = indexToSortedArray(index, (a, b) => a.localeCompare(b));

			expect(result).toEqual(["Apple", "Mango", "Zebra"]);
		});
	});
});
