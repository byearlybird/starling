#!/usr/bin/env bun
/**
 * Starling Benchmarks
 *
 * Comprehensive benchmark suite for Starling's CRDT operations and Store API.
 * Run with: bun run bench
 *
 * Sections:
 * - CRDT Document Operations: encode/decode/merge primitives
 * - Store Operations: add/update/delete/get/merge at scale
 */

import { bench, group, run, summary } from "mitata";
import { Store } from "./src/store";
import {
	decodeDoc,
	type EncodedDocument,
	encodeDoc,
	generateNonce,
	mergeDocs,
} from "./src/crdt";

// ============================================================================
// TEST DATA HELPERS
// ============================================================================

type TestData = {
	userId: string;
	username: string;
	email: string;
	status: string;
	metadata: {
		createdAt: string;
		tags: string[];
		settings: {
			theme: string;
			notifications: {
				email: boolean;
				sms: boolean;
			};
		};
	};
};

function generateTestData(index: number): TestData {
	return {
		userId: `user-${index}`,
		username: `user_${index}`,
		email: `user${index}@example.com`,
		status: index % 2 === 0 ? "active" : "inactive",
		metadata: {
			createdAt: "2025-01-01T00:00:00.000Z",
			tags: ["tag1", "tag2", "tag3"],
			settings: {
				theme: index % 3 === 0 ? "dark" : "light",
				notifications: {
					email: index % 2 === 0,
					sms: index % 3 === 0,
				},
			},
		},
	};
}

function generateEventstamp(counter: number): string {
	const isoString = "2025-01-01T00:00:00.000Z";
	const nonce = generateNonce();
	return `${isoString}|${counter.toString(16).padStart(4, "0")}|${nonce}`;
}

function createEncodedDocuments(count: number): EncodedDocument[] {
	const docs: EncodedDocument[] = [];
	for (let i = 0; i < count; i++) {
		const doc = encodeDoc(
			`doc-${i}`,
			generateTestData(i),
			generateEventstamp(i),
		);
		docs.push(doc);
	}
	return docs;
}

function createPairedDocuments(
	count: number,
): [EncodedDocument[], EncodedDocument[]] {
	const docs1: EncodedDocument[] = [];
	const docs2: EncodedDocument[] = [];
	for (let i = 0; i < count; i++) {
		docs1.push(
			encodeDoc(`doc-${i}`, generateTestData(i), generateEventstamp(i)),
		);
		docs2.push(
			encodeDoc(
				`doc-${i}`,
				generateTestData(i + count),
				generateEventstamp(i + count),
			),
		);
	}
	return [docs1, docs2];
}

// ============================================================================
// CRDT DOCUMENT OPERATIONS
// ============================================================================

summary(() => {
	group("CRDT: encodeDoc/decodeDoc - 100 items", () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			id: `doc-${i}`,
			data: generateTestData(i),
			eventstamp: generateEventstamp(i),
		}));
		const encodedDocs = createEncodedDocuments(100);

		bench("encodeDoc x100", () => {
			items.forEach(({ id, data, eventstamp }) => {
				encodeDoc(id, data, eventstamp);
			});
		});

		bench("decodeDoc x100", () => {
			encodedDocs.forEach((doc) => {
				decodeDoc(doc);
			});
		});

		bench("round-trip (encode + decode) x100", () => {
			items.forEach(({ id, data, eventstamp }) => {
				const encoded = encodeDoc(id, data, eventstamp);
				decodeDoc(encoded);
			});
		});
	});

	group("CRDT: encodeDoc/decodeDoc - 5,000 items", () => {
		const items = Array.from({ length: 5000 }, (_, i) => ({
			id: `doc-${i}`,
			data: generateTestData(i),
			eventstamp: generateEventstamp(i),
		}));
		const encodedDocs = createEncodedDocuments(5000);

		bench("encodeDoc x5000", () => {
			items.forEach(({ id, data, eventstamp }) => {
				encodeDoc(id, data, eventstamp);
			});
		});

		bench("decodeDoc x5000", () => {
			encodedDocs.forEach((doc) => {
				decodeDoc(doc);
			});
		});

		bench("round-trip (encode + decode) x5000", () => {
			items.forEach(({ id, data, eventstamp }) => {
				const encoded = encodeDoc(id, data, eventstamp);
				decodeDoc(encoded);
			});
		});
	});

	group("CRDT: encodeDoc/decodeDoc - 100,000 items", () => {
		const items = Array.from({ length: 100000 }, (_, i) => ({
			id: `doc-${i}`,
			data: generateTestData(i),
			eventstamp: generateEventstamp(i),
		}));
		const encodedDocs = createEncodedDocuments(100000);

		bench("encodeDoc x100000", () => {
			items.forEach(({ id, data, eventstamp }) => {
				encodeDoc(id, data, eventstamp);
			});
		});

		bench("decodeDoc x100000", () => {
			encodedDocs.forEach((doc) => {
				decodeDoc(doc);
			});
		});

		bench("round-trip (encode + decode) x100000", () => {
			items.forEach(({ id, data, eventstamp }) => {
				const encoded = encodeDoc(id, data, eventstamp);
				decodeDoc(encoded);
			});
		});
	});
});

summary(() => {
	group("CRDT: mergeDocs - 100 items", () => {
		const [encodedDocs1, encodedDocs2] = createPairedDocuments(100);

		bench("mergeDocs x100", () => {
			let result = encodedDocs1[0];
			if (!result) return;
			for (let i = 1; i < 100; i++) {
				const doc2 = encodedDocs2[i];
				if (!doc2) continue;
				const [merged] = mergeDocs(result, doc2);
				result = merged;
			}
		});
	});

	group("CRDT: mergeDocs - 5,000 items", () => {
		const [encodedDocs1, encodedDocs2] = createPairedDocuments(5000);

		bench("mergeDocs x5000", () => {
			let result = encodedDocs1[0];
			if (!result) return;
			for (let i = 1; i < 5000; i++) {
				const doc2 = encodedDocs2[i];
				if (!doc2) continue;
				const [merged] = mergeDocs(result, doc2);
				result = merged;
			}
		});
	});

	group("CRDT: mergeDocs - 100,000 items", () => {
		const [encodedDocs1, encodedDocs2] = createPairedDocuments(100000);

		bench("mergeDocs x100000", () => {
			let result = encodedDocs1[0];
			if (!result) return;
			for (let i = 1; i < 100000; i++) {
				const doc2 = encodedDocs2[i];
				if (!doc2) continue;
				const [merged] = mergeDocs(result, doc2);
				result = merged;
			}
		});
	});
});

// ============================================================================
// STORE OPERATIONS: ADD
// ============================================================================

summary(() => {
	group("Store: ADD operations", () => {
		bench("sequential add x1000", () => {
			const testData = Array.from({ length: 1000 }, (_, i) =>
				generateTestData(i),
			);
			const addStore = new Store<TestData>();
			return () => {
				testData.forEach((data, i) => {
					addStore.add(data, { withId: `item-${i}` });
				});
			};
		});

		bench("batch add x25000", () => {
			const testData = Array.from({ length: 25000 }, (_, i) =>
				generateTestData(i),
			);
			const txStore = new Store<TestData>();
			txStore.begin((tx) => {
				testData.forEach((data, i) => {
					tx.add(data, { withId: `item-${i}` });
				});
			});
		});
	});
});

// ============================================================================
// STORE OPERATIONS: GET
// ============================================================================

summary(() => {
	group("Store: GET operations", () => {
		const testData100 = Array.from({ length: 100 }, (_, i) =>
			generateTestData(i),
		);
		const store100 = new Store<TestData>();
		store100.begin((tx) => {
			testData100.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("get x100", () => {
			for (let i = 0; i < 100; i++) {
				store100.get(`item-${i}`);
			}
		});

		const testData5000 = Array.from({ length: 5000 }, (_, i) =>
			generateTestData(i),
		);
		const store5000 = new Store<TestData>();
		store5000.begin((tx) => {
			testData5000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("get x5000", () => {
			for (let i = 0; i < 5000; i++) {
				store5000.get(`item-${i}`);
			}
		});
	});
});

// ============================================================================
// STORE OPERATIONS: UPDATE
// ============================================================================

summary(() => {
	group("Store: UPDATE operations", () => {
		const testData1000 = Array.from({ length: 1000 }, (_, i) =>
			generateTestData(i),
		);
		const store1000 = new Store<TestData>();
		store1000.begin((tx) => {
			testData1000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("sequential update x1000", () => {
			testData1000.forEach((_, i) => {
				store1000.update(`item-${i}`, { status: "updated" });
			});
		});

		const testData25000 = Array.from({ length: 25000 }, (_, i) =>
			generateTestData(i),
		);
		const store25000 = new Store<TestData>();
		store25000.begin((tx) => {
			testData25000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("batch update x25000", () => {
			store25000.begin((tx) => {
				testData25000.forEach((_, i) => {
					tx.update(`item-${i}`, { status: "refreshed" });
				});
			});
		});
	});
});

// ============================================================================
// STORE OPERATIONS: DELETE
// ============================================================================

summary(() => {
	group("Store: DELETE operations", () => {
		bench("sequential del x1000", () => {
			const testData = Array.from({ length: 1000 }, (_, i) =>
				generateTestData(i),
			);
			const store = new Store<TestData>();
			store.begin((tx) => {
				testData.forEach((data, i) => {
					tx.add(data, { withId: `item-${i}` });
				});
			});
			testData.forEach((_, i) => {
				store.del(`item-${i}`);
			});
		});

		bench("batch del x25000", () => {
			const testData = Array.from({ length: 25000 }, (_, i) =>
				generateTestData(i),
			);
			const store = new Store<TestData>();
			store.begin((tx) => {
				testData.forEach((data, i) => {
					tx.add(data, { withId: `item-${i}` });
				});
			});
			store.begin((tx) => {
				testData.forEach((_, i) => {
					tx.del(`item-${i}`);
				});
			});
		});
	});
});

// ============================================================================
// STORE OPERATIONS: ITERATION & SNAPSHOT
// ============================================================================

summary(() => {
	group("Store: ITERATION operations", () => {
		const testData1000 = Array.from({ length: 1000 }, (_, i) =>
			generateTestData(i),
		);
		const store1000 = new Store<TestData>();
		store1000.begin((tx) => {
			testData1000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("entries() x1000", () => {
			let _count = 0;
			for (const [,] of store1000.entries()) {
				_count++;
			}
		});

		const testData25000 = Array.from({ length: 25000 }, (_, i) =>
			generateTestData(i),
		);
		const store25000 = new Store<TestData>();
		store25000.begin((tx) => {
			testData25000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("entries() x25000", () => {
			let _count = 0;
			for (const [,] of store25000.entries()) {
				_count++;
			}
		});
	});

	group("Store: SNAPSHOT operations", () => {
		const testData1000 = Array.from({ length: 1000 }, (_, i) =>
			generateTestData(i),
		);
		const store1000 = new Store<TestData>();
		store1000.begin((tx) => {
			testData1000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("collection() x1000", () => {
			store1000.collection();
		});

		const testData25000 = Array.from({ length: 25000 }, (_, i) =>
			generateTestData(i),
		);
		const store25000 = new Store<TestData>();
		store25000.begin((tx) => {
			testData25000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});

		bench("collection() x25000", () => {
			store25000.collection();
		});
	});
});

// ============================================================================
// STORE OPERATIONS: MERGE
// ============================================================================

summary(() => {
	group("Store: MERGE operations", () => {
		const testData1000 = Array.from({ length: 1000 }, (_, i) =>
			generateTestData(i),
		);
		const store1000 = new Store<TestData>();
		store1000.begin((tx) => {
			testData1000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});
		const collection1000 = store1000.collection();

		bench("merge x1000", () => {
			const mergeStore = new Store<TestData>();
			mergeStore.merge(collection1000);
		});

		const testData25000 = Array.from({ length: 25000 }, (_, i) =>
			generateTestData(i),
		);
		const store25000 = new Store<TestData>();
		store25000.begin((tx) => {
			testData25000.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});
		const collection25000 = store25000.collection();

		bench("merge x25000", () => {
			const mergeStore = new Store<TestData>();
			mergeStore.merge(collection25000);
		});
	});
});

// ============================================================================
// STORE OPERATIONS: COMPLEX WORKFLOWS
// ============================================================================

summary(() => {
	group("Store: COMPLEX workflows", () => {
		bench("add 5000 then delete 5000", () => {
			const testData = Array.from({ length: 5000 }, (_, i) =>
				generateTestData(i),
			);
			const store = new Store<TestData>();

			store.begin((tx) => {
				testData.forEach((data, i) => {
					tx.add(data, { withId: `item-${i}` });
				});
			});

			store.begin((tx) => {
				testData.forEach((_, i) => {
					tx.del(`item-${i}`);
				});
			});
		});

		bench("mixed ops x1000", () => {
			const testData = Array.from({ length: 1000 }, (_, i) =>
				generateTestData(i),
			);
			const store = new Store<TestData>();

			store.begin((tx) => {
				testData.forEach((data, i) => {
					tx.add(data, { withId: `item-${i}` });
				});
			});

			for (let i = 0; i < 500; i++) {
				store.get(`item-${i}`);
			}

			store.begin((tx) => {
				for (let i = 0; i < 500; i++) {
					tx.update(`item-${i}`, { status: "updated" });
				}
			});

			store.begin((tx) => {
				for (let i = 500; i < 1000; i++) {
					tx.del(`item-${i}`);
				}
			});
		});
	});
});

await run();
