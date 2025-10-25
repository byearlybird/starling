import { bench, group, run } from "mitata";
import { createStore } from "./store.ts";

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
			id: crypto.randomUUID(),
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
const items100000 = generateItems(100000);

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
const updates100000 = items100000.map(({ key }) => ({
	key,
	value: { active: false, value: 42 },
}));

// Pre-generate deletion keys
const keys100 = items100.map(({ key }) => key);
const keys5000 = items5000.map(({ key }) => key);
const keys25000 = items25000.map(({ key }) => key);
const keys100000 = items100000.map(({ key }) => key);

group("putMany", () => {
	bench("putMany 100 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100.map(({ key, value }) => [key, value]));
	});

	bench("putMany 5000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items5000.map(({ key, value }) => [key, value]));
	});

	bench("putMany 25000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items25000.map(({ key, value }) => [key, value]));
	});

	bench("putMany 100000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100000.map(({ key, value }) => [key, value]));
	});
});

group("updateMany", () => {
	bench("updateMany 100 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100.map(({ key, value }) => [key, value]));
		store.updateMany(updates100.map(({ key, value }) => [key, value]));
	});

	bench("updateMany 5000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items5000.map(({ key, value }) => [key, value]));
		store.updateMany(updates5000.map(({ key, value }) => [key, value]));
	});

	bench("updateMany 25000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items25000.map(({ key, value }) => [key, value]));
		store.updateMany(updates25000.map(({ key, value }) => [key, value]));
	});

	bench("updateMany 100000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100000.map(({ key, value }) => [key, value]));
		store.updateMany(updates100000.map(({ key, value }) => [key, value]));
	});
});

group("deleteMany", () => {
	bench("deleteMany 100 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100.map(({ key, value }) => [key, value]));
		store.deleteMany(keys100);
	});

	bench("deleteMany 5000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items5000.map(({ key, value }) => [key, value]));
		store.deleteMany(keys5000);
	});

	bench("deleteMany 25000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items25000.map(({ key, value }) => [key, value]));
		store.deleteMany(keys25000);
	});

	bench("deleteMany 100000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100000.map(({ key, value }) => [key, value]));
		store.deleteMany(keys100000);
	});
});

group("values()", () => {
	bench("values() 100 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100.map(({ key, value }) => [key, value]));
		store.values();
	});

	bench("values() 5000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items5000.map(({ key, value }) => [key, value]));
		store.values();
	});

	bench("values() 25000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items25000.map(({ key, value }) => [key, value]));
		store.values();
	});

	bench("values() 100000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100000.map(({ key, value }) => [key, value]));
		store.values();
	});
});

group("snapshot()", () => {
	bench("snapshot() 100 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100.map(({ key, value }) => [key, value]));
		store.snapshot();
	});

	bench("snapshot() 5000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items5000.map(({ key, value }) => [key, value]));
		store.snapshot();
	});

	bench("snapshot() 25000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items25000.map(({ key, value }) => [key, value]));
		store.snapshot();
	});

	bench("snapshot() 100000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100000.map(({ key, value }) => [key, value]));
		store.snapshot();
	});
});

group("merge()", () => {
	bench("merge() 100 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100.map(({ key, value }) => [key, value]));
		store.merge(
			Array.from(store.snapshot().entries()),
		);
	});

	bench("merge() 5000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items5000.map(({ key, value }) => [key, value]));
		store.merge(
			Array.from(store.snapshot().entries()),
		);
	});

	bench("merge() 25000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items25000.map(({ key, value }) => [key, value]));
		store.merge(
			Array.from(store.snapshot().entries()),
		);
	});

	bench("merge() 100000 items", () => {
		const store = createStore<TestItem>("items");
		store.putMany(items100000.map(({ key, value }) => [key, value]));
		store.merge(
			Array.from(store.snapshot().entries()),
		);
	});
});

await run();
