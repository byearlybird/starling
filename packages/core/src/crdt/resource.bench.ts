import { bench, group, run } from "mitata";
import {
	decodeResource,
	encodeResource,
	generateNonce,
	mergeResources,
	type ResourceObject,
} from ".";

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

// Helper to generate eventstamp
function generateEventstamp(counter: number): string {
	const isoString = "2025-01-01T00:00:00.000Z";
	const nonce = generateNonce();
	return `${isoString}|${counter.toString(16).padStart(4, "0")}|${nonce}`;
}

// Create pre-encoded resource objects for decode benchmarks
function createEncodedResources(count: number): ResourceObject[] {
	const resources: ResourceObject[] = [];
	for (let i = 0; i < count; i++) {
		const resource = encodeResource(
			`doc-${i}`,
			generateTestData(i),
			generateEventstamp(i),
		);
		resources.push(resource);
	}
	return resources;
}

// Create paired resource object sets for merging
function createPairedResources(
	count: number,
): [ResourceObject[], ResourceObject[]] {
	const resources1: ResourceObject[] = [];
	const resources2: ResourceObject[] = [];
	for (let i = 0; i < count; i++) {
		resources1.push(
			encodeResource(`doc-${i}`, generateTestData(i), generateEventstamp(i)),
		);
		resources2.push(
			encodeResource(
				`doc-${i}`,
				generateTestData(i + count),
				generateEventstamp(i + count),
			),
		);
	}
	return [resources1, resources2];
}

// ============================================================================
// BENCHMARK SUITES
// ============================================================================

// --- 100 Items ---
group("encodeResource/decodeResource - 100 items", () => {
	const items = Array.from({ length: 100 }, (_, i) => ({
		id: `doc-${i}`,
		data: generateTestData(i),
		eventstamp: generateEventstamp(i),
	}));
	const encodedResources = createEncodedResources(100);

	bench("encodeResource x100", () => {
		items.forEach(({ id, data, eventstamp }) => {
			encodeResource(id, data, eventstamp);
		});
	});

	bench("decodeResource x100", () => {
		encodedResources.forEach((resource) => {
			decodeResource(resource);
		});
	});

	bench("round-trip (encode + decode) x100", () => {
		items.forEach(({ id, data, eventstamp }) => {
			const encoded = encodeResource(id, data, eventstamp);
			decodeResource(encoded);
		});
	});
});

// --- 5,000 Items ---
group("encodeResource/decodeResource - 5,000 items", () => {
	const items = Array.from({ length: 5000 }, (_, i) => ({
		id: `doc-${i}`,
		data: generateTestData(i),
		eventstamp: generateEventstamp(i),
	}));
	const encodedResources = createEncodedResources(5000);

	bench("encodeResource x5000", () => {
		items.forEach(({ id, data, eventstamp }) => {
			encodeResource(id, data, eventstamp);
		});
	});

	bench("decodeResource x5000", () => {
		encodedResources.forEach((resource) => {
			decodeResource(resource);
		});
	});

	bench("round-trip (encode + decode) x5000", () => {
		items.forEach(({ id, data, eventstamp }) => {
			const encoded = encodeResource(id, data, eventstamp);
			decodeResource(encoded);
		});
	});
});

// --- 100,000 Items ---
group("encodeResource/decodeResource - 100,000 items", () => {
	const items = Array.from({ length: 100000 }, (_, i) => ({
		id: `doc-${i}`,
		data: generateTestData(i),
		eventstamp: generateEventstamp(i),
	}));
	const encodedResources = createEncodedResources(100000);

	bench("encodeResource x100000", () => {
		items.forEach(({ id, data, eventstamp }) => {
			encodeResource(id, data, eventstamp);
		});
	});

	bench("decodeResource x100000", () => {
		encodedResources.forEach((resource) => {
			decodeResource(resource);
		});
	});

	bench("round-trip (encode + decode) x100000", () => {
		items.forEach(({ id, data, eventstamp }) => {
			const encoded = encodeResource(id, data, eventstamp);
			decodeResource(encoded);
		});
	});
});

// ============================================================================
// MERGEDOCS BENCHMARK SUITES
// ============================================================================

// --- 100 Items ---
group("mergeResources - 100 items", () => {
	const [encodedResources1, encodedResources2] = createPairedResources(100);

	bench("mergeResources x100", () => {
		let result = encodedResources1[0];
		for (let i = 1; i < 100; i++) {
			[result] = mergeResources(result!, encodedResources2[i]!);
		}
	});
});

// --- 5,000 Items ---
group("mergeResources - 5,000 items", () => {
	const [encodedResources1, encodedResources2] = createPairedResources(5000);

	bench("mergeResources x5000", () => {
		let result = encodedResources1[0];
		for (let i = 1; i < 5000; i++) {
			[result] = mergeResources(result!, encodedResources2[i]!);
		}
	});
});

// --- 100,000 Items ---
group("mergeResources - 100,000 items", () => {
	const [encodedResources1, encodedResources2] = createPairedResources(100000);

	bench("mergeResources x100000", () => {
		let result = encodedResources1[0];
		for (let i = 1; i < 100000; i++) {
			[result] = mergeResources(result!, encodedResources2[i]!);
		}
	});
});

await run();
