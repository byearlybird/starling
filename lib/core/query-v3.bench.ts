import { bench, group, run } from "mitata";
import { ulid } from "ulid";
import { createQuery } from "./query-v3";
import { createStore } from "./store-v3";

const ITEM_COUNT = 4000;

// Create a monotonic counter-based eventstamp function
let counter = 0;
const eventstampFn = () => {
	counter++;
	return `${Date.now()}-${counter}`;
};

// Reset counter between benches
const resetCounter = () => {
	counter = 0;
};

interface TestItem {
	id: string;
	name: string;
	value: number;
	active: boolean;
}

// Generate test data
const generateItems = (count: number): { key: string; value: TestItem }[] => {
	return Array.from({ length: count }, (_, i) => ({
		key: `item-${i}`,
		value: {
			id: ulid(),
			name: `Item ${i}`,
			value: Math.random() * 100,
			active: i % 2 === 0,
		},
	}));
};

group("Query Operations - 4000 items", () => {
	bench("createQuery with all items matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		createQuery(store, () => true);
	});

	bench("createQuery with 50% items matching (active=true)", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		createQuery(store, (item) => item.active === true);
	});

	bench("createQuery with no items matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		createQuery(store, () => false);
	});

	bench("createQuery with complex predicate (value >= 50 && active)", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		createQuery(store, (item) => item.value >= 50 && item.active === true);
	});

	bench("results() on query with all items matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, () => true);
		query.results();
	});

	bench("results() on query with 50% items matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, (item) => item.active === true);
		query.results();
	});

	bench("putMany + query onChange callback (all matching)", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, () => true);
		let changeCount = 0;
		query.onChange(() => {
			changeCount++;
		});

		// Add more items to trigger onChange
		const newItems = generateItems(100).map((item, i) => ({
			...item,
			key: `new-item-${i}`,
		}));
		store.putMany(newItems);
	});

	bench("updateMany on query with 50% items matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, (item) => item.active === true);
		let changeCount = 0;
		query.onChange(() => {
			changeCount++;
		});

		// Update all items to make them inactive
		const updates = items.map(({ key }) => ({
			key,
			value: { active: false },
		}));
		store.updateMany(updates);
	});

	bench("deleteMany on query with all items matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, () => true);
		let changeCount = 0;
		query.onChange(() => {
			changeCount++;
		});

		// Delete all items
		const keys = items.map(({ key }) => key);
		store.deleteMany(keys);
	});

	bench("multiple onChange listeners on same query", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, (item) => item.active === true);
		let count1 = 0;
		let count2 = 0;
		let count3 = 0;

		query.onChange(() => {
			count1++;
		});
		query.onChange(() => {
			count2++;
		});
		query.onChange(() => {
			count3++;
		});

		// Trigger changes
		const newItems = generateItems(100).map((item, i) => ({
			...item,
			key: `new-item-${i}`,
		}));
		store.putMany(newItems);
	});

	bench("subscribe and unsubscribe from query", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, (item) => item.active === true);
		let changeCount = 0;

		const unsubscribe = query.onChange(() => {
			changeCount++;
		});

		// Add items
		const newItems = generateItems(50).map((item, i) => ({
			...item,
			key: `new-item-${i}`,
		}));
		store.putMany(newItems);

		unsubscribe();

		// Add more items (should not trigger callback)
		const moreItems = generateItems(50).map((item, i) => ({
			...item,
			key: `more-item-${i}`,
		}));
		store.putMany(moreItems);
	});

	bench("dispose query", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		const query = createQuery(store, (item) => item.active === true);
		let changeCount = 0;
		query.onChange(() => {
			changeCount++;
		});

		// Dispose the query
		query.dispose();

		// Add items (should not trigger callback)
		const newItems = generateItems(100).map((item, i) => ({
			...item,
			key: `new-item-${i}`,
		}));
		store.putMany(newItems);
	});

	bench("full lifecycle: create, query, observe, update, dispose", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);

		// Create and populate store
		store.putMany(items);

		// Create query with predicate
		const query = createQuery(store, (item) => item.value >= 50);

		// Get initial results
		const initialResults = query.results();

		// Subscribe to changes
		let changeCount = 0;
		const unsubscribe = query.onChange(() => {
			changeCount++;
		});

		// Update subset of items
		const updates = items.slice(0, 500).map(({ key }) => ({
			key,
			value: { value: 75 },
		}));
		store.updateMany(updates);

		// Get updated results
		const updatedResults = query.results();

		// Delete subset of items
		const keysToDelete = items.slice(500, 1000).map(({ key }) => key);
		store.deleteMany(keysToDelete);

		// Cleanup
		unsubscribe();
		query.dispose();
	});

	bench("predicate filter with string matching", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		createQuery(store, (item) => item.name.includes("Item 1"));
	});

	bench("predicate filter with multiple conditions", () => {
		resetCounter();
		const store = createStore<TestItem>({ eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		createQuery(
			store,
			(item) =>
				item.active === true && item.value > 50 && item.name.length > 5,
		);
	});
});

await run();
