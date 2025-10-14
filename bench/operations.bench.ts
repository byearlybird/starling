import { Bench } from "tinybench";
import { decode, encode, merge } from "../lib/operations";
import type { DecodedObject, EncodedObject } from "../lib/types";

// Helper to generate eventstamp
const eventstampFn = () => new Date().toISOString();

// Helper to generate object
const createObject = (propCount: number): DecodedObject => {
	const obj: DecodedObject = {};
	for (let i = 0; i < propCount; i++) {
		obj[`field${i}`] = `value${i}`;
	}
	return obj;
};

// Pre-encode objects for decode and merge benchmarks
const smallEncoded = encode(createObject(3), eventstampFn);
const mediumEncoded = encode(createObject(10), eventstampFn);
const largeEncoded = encode(createObject(100), eventstampFn);

// Create variants for merge testing
const createVariantEncoded = (base: EncodedObject): EncodedObject => {
	const result: EncodedObject = {};
	const keys = Object.keys(base);
	// Take half the keys and modify some values
	for (let i = 0; i < keys.length; i++) {
		if (i % 2 === 0) {
			const key = keys[i]!;
			const value = base[key];
			if (key && value) {
				result[key] = {
					__value: `modified_${value.__value}`,
					__eventstamp: eventstampFn(),
				};
			}
		}
	}
	return result;
};

const bench = new Bench({ name: "Operations Benchmark", time: 500 });

// Encode benchmarks
bench
	.add("encode - small object (3 properties)", () => {
		encode(createObject(3), eventstampFn);
	})
	.add("encode - medium object (10 properties)", () => {
		encode(createObject(10), eventstampFn);
	})
	.add("encode - large object (100 properties)", () => {
		encode(createObject(100), eventstampFn);
	});

// Decode benchmarks
bench
	.add("decode - small object (3 properties)", () => {
		decode(smallEncoded);
	})
	.add("decode - medium object (10 properties)", () => {
		decode(mediumEncoded);
	})
	.add("decode - large object (100 properties)", () => {
		decode(largeEncoded);
	});

// Merge benchmarks
bench
	.add("merge - small objects (3 properties, no overlap)", () => {
		const obj1 = encode({ a: 1, b: 2, c: 3 }, eventstampFn);
		const obj2 = encode({ d: 4, e: 5, f: 6 }, eventstampFn);
		merge(obj1, obj2);
	})
	.add("merge - small objects (3 properties, full overlap)", () => {
		const obj1 = encode({ a: 1, b: 2, c: 3 }, eventstampFn);
		const obj2 = encode({ a: 4, b: 5, c: 6 }, eventstampFn);
		merge(obj1, obj2);
	})
	.add("merge - medium objects (10 properties, 50% overlap)", () => {
		merge(mediumEncoded, createVariantEncoded(mediumEncoded));
	})
	.add("merge - large objects (100 properties, 50% overlap)", () => {
		merge(largeEncoded, createVariantEncoded(largeEncoded));
	});

// Full round-trip benchmarks
bench
	.add("full round-trip - encode + decode (small)", () => {
		const obj = createObject(3);
		const encoded = encode(obj, eventstampFn);
		decode(encoded);
	})
	.add("full round-trip - encode + merge + decode (medium)", () => {
		const obj1 = createObject(10);
		const obj2 = createObject(10);
		const encoded1 = encode(obj1, eventstampFn);
		const encoded2 = encode(obj2, eventstampFn);
		const merged = merge(encoded1, encoded2);
		decode(merged);
	});

await bench.run();

const benchName = bench.name ?? "Operations Benchmark";
console.log("\n" + benchName);
console.log("=".repeat(benchName.length));
console.table(bench.table());
