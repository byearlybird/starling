import { bench, group, run } from "mitata";
import { ulid } from "ulid";
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

group("Store Operations - 4000 items", () => {
	bench("putMany 4000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);
	});

	bench("updateMany 4000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		// Update all items
		const updates = items.map(({ key }) => ({
			key,
			value: { active: false, value: 42 },
		}));
		store.updateMany(updates);
	});

	bench("deleteMany 4000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);

		// Delete all items
		const keys = items.map(({ key }) => key);
		store.deleteMany(keys);
	});

	bench("putMany + updateMany + deleteMany (full cycle)", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		const items = generateItems(ITEM_COUNT);

		// Insert
		store.putMany(items);

		// Update
		const updates = items.map(({ key }) => ({
			key,
			value: { active: false },
		}));
		store.updateMany(updates);

		// Delete
		const keys = items.map(({ key }) => key);
		store.deleteMany(keys);
	});

	bench("values() after putMany", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);
		store.values();
	});

	bench("snapshot() after putMany", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		const items = generateItems(ITEM_COUNT);
		store.putMany(items);
		store.snapshot();
	});
});

await run();
