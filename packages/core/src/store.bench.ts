import { bench, group, run } from "mitata";
import { createStore } from "./store";

// Test data type: 4+ properties with 3-level nesting
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

// Helper to generate consistent test data
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

// ============================================================================
// BENCHMARK SUITES
// ============================================================================

// Test 1: 1000 sequential ADDs
group("Test 1: 1000 sequential ADDs", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));

	bench("sequential add x1000", () => {
		// Store creation done outside timing - only measure add operations
		const addStore = createStore<TestData>();
		return () => {
			testData.forEach((data, i) => {
				addStore.add(data, { withId: `item-${i}` });
			});
		};
	});
});

// Test 2: 25000 ADDs in a transaction
group("Test 2: 25000 ADDs in a transaction", () => {
	const testData = Array.from({ length: 25000 }, (_, i) => generateTestData(i));

	bench("batch add x25000", () => {
		const txStore = createStore<TestData>();
		txStore.begin((tx) => {
			testData.forEach((data, i) => {
				tx.add(data, { withId: `item-${i}` });
			});
		});
	});
});

// Test 3: 100 GETs without index
group("Test 3: 100 GETs", () => {
	const testData = Array.from({ length: 100 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("get x100", () => {
		for (let i = 0; i < 100; i++) {
			store.get(`item-${i}`);
		}
	});
});

// Test 4: 5000 GETs
group("Test 4: 5000 GETs", () => {
	const testData = Array.from({ length: 5000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("get x5000", () => {
		for (let i = 0; i < 5000; i++) {
			store.get(`item-${i}`);
		}
	});
});

// Test 5: 1000 sequential UPDATEs
group("Test 5: 1000 sequential UPDATEs", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("sequential update x1000", () => {
		testData.forEach((_, i) => {
			store.update(`item-${i}`, { status: "updated" });
		});
	});
});

// Test 6: 25000 UPDATEs in a transaction
group("Test 6: 25000 UPDATEs in a transaction", () => {
	const testData = Array.from({ length: 25000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("batch update x25000", () => {
		store.begin((tx) => {
			testData.forEach((_, i) => {
				tx.update(`item-${i}`, { status: "refreshed" });
			});
		});
	});
});

// Test 7: entries() iteration - 1000 items
group("Test 7: entries() iteration - 1000 items", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("entries() x1000", () => {
		let count = 0;
		for (const [,] of store.entries()) {
			count++;
		}
	});
});

// Test 8: entries() iteration - 25000 items
group("Test 8: entries() iteration - 25000 items", () => {
	const testData = Array.from({ length: 25000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("entries() x25000", () => {
		let count = 0;
		for (const [,] of store.entries()) {
			count++;
		}
	});
});

// Test 9: snapshot() - 1000 items
group("Test 9: snapshot() - 1000 items", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("collection() x1000", () => {
		store.collection();
	});
});

// Test 10: collection() - 25000 items
group("Test 10: collection() - 25000 items", () => {
	const testData = Array.from({ length: 25000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("collection() x25000", () => {
		store.collection();
	});
});

// Test 11: 1000 sequential DELETEs
group("Test 11: 1000 sequential DELETEs", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("sequential del x1000", () => {
		testData.forEach((_, i) => {
			store.del(`item-${i}`);
		});
	});
});

// Test 12: 25000 DELETEs in a transaction
group("Test 12: 25000 DELETEs in a transaction", () => {
	const testData = Array.from({ length: 25000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	bench("batch del x25000", () => {
		store.begin((tx) => {
			testData.forEach((_, i) => {
				tx.del(`item-${i}`);
			});
		});
	});
});

// Test 13: MERGE 1000 documents
group("Test 13: MERGE 1000 documents", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	const collection = store.collection();

	bench("batch merge x1000", () => {
		const mergeStore = createStore<TestData>();
		mergeStore.begin((tx) => {
			collection["~docs"].forEach((doc) => {
				tx.merge(doc);
			});
		});
	});
});

// Test 14: MERGE 25000 documents
group("Test 14: MERGE 25000 documents", () => {
	const testData = Array.from({ length: 25000 }, (_, i) => generateTestData(i));
	const store = createStore<TestData>();

	store.begin((tx) => {
		testData.forEach((data, i) => {
			tx.add(data, { withId: `item-${i}` });
		});
	});

	const collection = store.collection();

	bench("batch merge x25000", () => {
		const mergeStore = createStore<TestData>();
		mergeStore.begin((tx) => {
			collection["~docs"].forEach((doc) => {
				tx.merge(doc);
			});
		});
	});
});

// Test 15: ADD followed by DELETE (bulk delete after insert)
group("Test 15: ADD followed by bulk DELETE", () => {
	const testData = Array.from({ length: 5000 }, (_, i) => generateTestData(i));

	bench("add 5000 then delete 5000", () => {
		const store = createStore<TestData>();

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

// Test 16: Mixed operations (ADD, UPDATE, GET, DELETE)
group("Test 16: Mixed operations", () => {
	const testData = Array.from({ length: 1000 }, (_, i) => generateTestData(i));

	bench("mixed ops x1000", () => {
		const store = createStore<TestData>();

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

await run();
