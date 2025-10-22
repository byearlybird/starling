import { bench, group, run } from "mitata";
import { ulid } from "ulid";
import { createStore } from "./store";

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

// Pre-generate test data at all sizes (outside benchmarks)
const items100 = generateItems(100);
const items5000 = generateItems(5000);
const items25000 = generateItems(25000);

// Pre-generate update data
const updates100 = items100.map(({ key }) => ({
	key,
	value: { active: false, value: 42 },
}));
const updates5000 = items5000.map(({ key }) => ({
	key,
	value: { active: false, value: 42 },
}));
const updates25000 = items25000.map(({ key }) => ({
	key,
	value: { active: false, value: 42 },
}));

// Pre-generate deletion keys
const keys100 = items100.map(({ key }) => key);
const keys5000 = items5000.map(({ key }) => key);
const keys25000 = items25000.map(({ key }) => key);

group("putMany", () => {
	bench("putMany 100 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items100);
	});

	bench("putMany 5000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items5000);
	});

	bench("putMany 25000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items25000);
	});
});

group("updateMany", () => {
	bench("updateMany 100 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items100);
		store.updateMany(updates100);
	});

	bench("updateMany 5000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items5000);
		store.updateMany(updates5000);
	});

	bench("updateMany 25000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items25000);
		store.updateMany(updates25000);
	});
});

group("deleteMany", () => {
	bench("deleteMany 100 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items100);
		store.deleteMany(keys100);
	});

	bench("deleteMany 5000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items5000);
		store.deleteMany(keys5000);
	});

	bench("deleteMany 25000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items25000);
		store.deleteMany(keys25000);
	});
});

group("values()", () => {
	bench("values() 100 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items100);
		store.values();
	});

	bench("values() 5000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items5000);
		store.values();
	});

	bench("values() 25000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items25000);
		store.values();
	});
});

group("snapshot()", () => {
	bench("snapshot() 100 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items100);
		store.snapshot();
	});

	bench("snapshot() 5000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items5000);
		store.snapshot();
	});

	bench("snapshot() 25000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items25000);
		store.snapshot();
	});
});

group("merge()", () => {
	bench("merge() 100 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items100);
		store.merge(store.snapshot());
	});

	bench("merge() 5000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items5000);
		store.merge(store.snapshot());
	});

	bench("merge() 25000 items", () => {
		resetCounter();
		const store = createStore<TestItem>("items", { eventstampFn });
		store.putMany(items25000);
		store.merge(store.snapshot());
	});
});

await run();
