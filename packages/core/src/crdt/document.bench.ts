import { bench, group, run } from "mitata";
import {
	decodeDoc,
	type EncodedDocument,
	encodeDoc,
	generateNonce,
	mergeDocs,
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

// Create pre-encoded documents for decode benchmarks
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

// Create paired document sets for merging
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
// BENCHMARK SUITES
// ============================================================================

// --- 100 Items ---
group("encodeDoc/decodeDoc - 100 items", () => {
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

// --- 5,000 Items ---
group("encodeDoc/decodeDoc - 5,000 items", () => {
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

// --- 100,000 Items ---
group("encodeDoc/decodeDoc - 100,000 items", () => {
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

// ============================================================================
// MERGEDOCS BENCHMARK SUITES
// ============================================================================

// --- 100 Items ---
group("mergeDocs - 100 items", () => {
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

// --- 5,000 Items ---
group("mergeDocs - 5,000 items", () => {
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

// --- 100,000 Items ---
group("mergeDocs - 100,000 items", () => {
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

await run();
