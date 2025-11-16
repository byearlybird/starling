#!/usr/bin/env bun
/**
 * Starling Benchmarks
 *
 * Benchmark suite testing performance across different document sizes.
 * Modeled after database benchmarks that test operations on small, medium, and large rows.
 *
 * Run with: bun run bench
 *
 * Document Sizes:
 * - Small:  ~100 bytes  (minimal user profile)
 * - Medium: ~1KB        (user with metadata and preferences)
 * - Large:  ~10KB       (user with extensive history and rich content)
 *
 * Operations tested at each size:
 * - CRDT primitives: encode, decode, merge
 * - Store CRUD: add, get, update, delete
 * - Store bulk operations: batch add, batch merge, iteration
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
// DOCUMENT SIZE GENERATORS
// ============================================================================

/** Small document: ~100 bytes (minimal user profile) */
type SmallDoc = {
	id: string;
	name: string;
	email: string;
	status: "active" | "inactive";
};

function generateSmallDoc(index: number): SmallDoc {
	return {
		id: `user-${index}`,
		name: `User ${index}`,
		email: `user${index}@example.com`,
		status: index % 2 === 0 ? "active" : "inactive",
	};
}

/** Medium document: ~1KB (user with metadata and preferences) */
type MediumDoc = {
	id: string;
	username: string;
	email: string;
	profile: {
		firstName: string;
		lastName: string;
		bio: string;
		avatar: string;
	};
	preferences: {
		theme: "light" | "dark";
		language: string;
		notifications: {
			email: boolean;
			push: boolean;
			sms: boolean;
		};
		privacy: {
			profileVisible: boolean;
			showEmail: boolean;
			showActivity: boolean;
		};
	};
	metadata: {
		createdAt: string;
		updatedAt: string;
		lastLogin: string;
		loginCount: number;
		tags: string[];
	};
};

function generateMediumDoc(index: number): MediumDoc {
	return {
		id: `user-${index}`,
		username: `user_${index}`,
		email: `user${index}@example.com`,
		profile: {
			firstName: `First${index}`,
			lastName: `Last${index}`,
			bio: `This is a biographical description for user ${index}. They are interested in technology, science, and various other topics.`,
			avatar: `https://example.com/avatars/${index}.jpg`,
		},
		preferences: {
			theme: index % 2 === 0 ? "light" : "dark",
			language: "en-US",
			notifications: {
				email: index % 2 === 0,
				push: index % 3 === 0,
				sms: false,
			},
			privacy: {
				profileVisible: true,
				showEmail: false,
				showActivity: index % 2 === 0,
			},
		},
		metadata: {
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-15T00:00:00.000Z",
			lastLogin: "2025-01-16T00:00:00.000Z",
			loginCount: index * 10,
			tags: ["user", "active", "verified", `tier-${index % 3}`],
		},
	};
}

/** Large document: ~10KB (user with extensive history and rich content) */
type LargeDoc = {
	id: string;
	username: string;
	email: string;
	profile: {
		firstName: string;
		lastName: string;
		bio: string;
		avatar: string;
		socialLinks: Record<string, string>;
		location: {
			city: string;
			country: string;
			timezone: string;
		};
	};
	preferences: {
		theme: "light" | "dark";
		language: string;
		notifications: Record<string, boolean>;
		privacy: Record<string, boolean>;
		accessibility: Record<string, unknown>;
	};
	activity: {
		loginHistory: Array<{ timestamp: string; ip: string; userAgent: string }>;
		recentActions: Array<{
			type: string;
			timestamp: string;
			metadata: Record<string, unknown>;
		}>;
	};
	content: {
		posts: Array<{ id: string; title: string; content: string; tags: string[] }>;
		comments: Array<{
			id: string;
			postId: string;
			content: string;
			timestamp: string;
		}>;
	};
	metadata: {
		createdAt: string;
		updatedAt: string;
		lastLogin: string;
		loginCount: number;
		tags: string[];
		customFields: Record<string, unknown>;
	};
};

function generateLargeDoc(index: number): LargeDoc {
	return {
		id: `user-${index}`,
		username: `user_${index}`,
		email: `user${index}@example.com`,
		profile: {
			firstName: `First${index}`,
			lastName: `Last${index}`,
			bio: `This is an extensive biographical description for user ${index}. They have a rich history on the platform and are very active in the community. Their interests span across multiple domains including technology, science, art, music, and literature. They frequently contribute valuable insights and have built a strong reputation over time.`.repeat(
				2,
			),
			avatar: `https://example.com/avatars/${index}.jpg`,
			socialLinks: {
				twitter: `https://twitter.com/user${index}`,
				linkedin: `https://linkedin.com/in/user${index}`,
				github: `https://github.com/user${index}`,
				website: `https://user${index}.com`,
			},
			location: {
				city: "San Francisco",
				country: "USA",
				timezone: "America/Los_Angeles",
			},
		},
		preferences: {
			theme: index % 2 === 0 ? "light" : "dark",
			language: "en-US",
			notifications: {
				email: true,
				push: true,
				sms: false,
				desktop: true,
				mentions: true,
				followers: true,
				messages: true,
			},
			privacy: {
				profileVisible: true,
				showEmail: false,
				showActivity: true,
				showFollowers: true,
				allowMessages: true,
				allowComments: true,
			},
			accessibility: {
				highContrast: false,
				reducedMotion: false,
				screenReader: false,
				fontSize: 16,
			},
		},
		activity: {
			loginHistory: Array.from({ length: 10 }, (_, i) => ({
				timestamp: `2025-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
				ip: `192.168.1.${i}`,
				userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
			})),
			recentActions: Array.from({ length: 20 }, (_, i) => ({
				type: ["post", "comment", "like", "share"][i % 4] as string,
				timestamp: `2025-01-15T${String(i).padStart(2, "0")}:00:00.000Z`,
				metadata: {
					targetId: `item-${i}`,
					count: i,
				},
			})),
		},
		content: {
			posts: Array.from({ length: 5 }, (_, i) => ({
				id: `post-${i}`,
				title: `Post ${i} - An interesting discussion about technology and innovation`,
				content: `This is the full content of post ${i}. It contains detailed information and insights. `.repeat(
					10,
				),
				tags: ["tech", "innovation", "discussion", `topic-${i}`],
			})),
			comments: Array.from({ length: 15 }, (_, i) => ({
				id: `comment-${i}`,
				postId: `post-${i % 5}`,
				content: `This is a thoughtful comment on the post. It adds valuable perspective. `.repeat(
					3,
				),
				timestamp: `2025-01-15T${String(i).padStart(2, "0")}:30:00.000Z`,
			})),
		},
		metadata: {
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-15T00:00:00.000Z",
			lastLogin: "2025-01-16T00:00:00.000Z",
			loginCount: index * 100,
			tags: Array.from({ length: 10 }, (_, i) => `tag-${i}`),
			customFields: {
				field1: "value1",
				field2: 42,
				field3: true,
				field4: ["array", "of", "values"],
				field5: { nested: "object" },
			},
		},
	};
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateEventstamp(counter: number): string {
	const isoString = "2025-01-01T00:00:00.000Z";
	const nonce = generateNonce();
	return `${isoString}|${counter.toString(16).padStart(4, "0")}|${nonce}`;
}

// ============================================================================
// CRDT OPERATIONS: SMALL DOCUMENTS (~100 bytes)
// ============================================================================

summary(() => {
	group("CRDT: Small documents (~100 bytes)", () => {
		const doc = generateSmallDoc(0);
		const eventstamp = generateEventstamp(0);
		const encoded = encodeDoc("doc-0", doc, eventstamp);
		const doc2 = generateSmallDoc(1);
		const eventstamp2 = generateEventstamp(1);
		const encoded2 = encodeDoc("doc-0", doc2, eventstamp2);

		bench("encode", () => {
			encodeDoc("doc-0", doc, eventstamp);
		});

		bench("decode", () => {
			decodeDoc(encoded);
		});

		bench("merge", () => {
			mergeDocs(encoded, encoded2);
		});
	});
});

// ============================================================================
// CRDT OPERATIONS: MEDIUM DOCUMENTS (~1KB)
// ============================================================================

summary(() => {
	group("CRDT: Medium documents (~1KB)", () => {
		const doc = generateMediumDoc(0);
		const eventstamp = generateEventstamp(0);
		const encoded = encodeDoc("doc-0", doc, eventstamp);
		const doc2 = generateMediumDoc(1);
		const eventstamp2 = generateEventstamp(1);
		const encoded2 = encodeDoc("doc-0", doc2, eventstamp2);

		bench("encode", () => {
			encodeDoc("doc-0", doc, eventstamp);
		});

		bench("decode", () => {
			decodeDoc(encoded);
		});

		bench("merge", () => {
			mergeDocs(encoded, encoded2);
		});
	});
});

// ============================================================================
// CRDT OPERATIONS: LARGE DOCUMENTS (~10KB)
// ============================================================================

summary(() => {
	group("CRDT: Large documents (~10KB)", () => {
		const doc = generateLargeDoc(0);
		const eventstamp = generateEventstamp(0);
		const encoded = encodeDoc("doc-0", doc, eventstamp);
		const doc2 = generateLargeDoc(1);
		const eventstamp2 = generateEventstamp(1);
		const encoded2 = encodeDoc("doc-0", doc2, eventstamp2);

		bench("encode", () => {
			encodeDoc("doc-0", doc, eventstamp);
		});

		bench("decode", () => {
			decodeDoc(encoded);
		});

		bench("merge", () => {
			mergeDocs(encoded, encoded2);
		});
	});
});

// ============================================================================
// STORE OPERATIONS: SMALL DOCUMENTS (~100 bytes)
// ============================================================================

summary(() => {
	group("Store: Small documents (~100 bytes)", () => {
		const doc = generateSmallDoc(0);

		bench("add", () => {
			const store = new Store<SmallDoc>();
			store.add(doc, { withId: "doc-0" });
		});

		const storeWithDoc = new Store<SmallDoc>();
		storeWithDoc.add(doc, { withId: "doc-0" });

		bench("get", () => {
			storeWithDoc.get("doc-0");
		});

		bench("update", () => {
			storeWithDoc.update("doc-0", { status: "active" });
		});

		bench("delete", () => {
			const store = new Store<SmallDoc>();
			store.add(doc, { withId: "doc-0" });
			store.del("doc-0");
		});
	});
});

// ============================================================================
// STORE OPERATIONS: MEDIUM DOCUMENTS (~1KB)
// ============================================================================

summary(() => {
	group("Store: Medium documents (~1KB)", () => {
		const doc = generateMediumDoc(0);

		bench("add", () => {
			const store = new Store<MediumDoc>();
			store.add(doc, { withId: "doc-0" });
		});

		const storeWithDoc = new Store<MediumDoc>();
		storeWithDoc.add(doc, { withId: "doc-0" });

		bench("get", () => {
			storeWithDoc.get("doc-0");
		});

		bench("update", () => {
			storeWithDoc.update("doc-0", { username: "updated_user" });
		});

		bench("delete", () => {
			const store = new Store<MediumDoc>();
			store.add(doc, { withId: "doc-0" });
			store.del("doc-0");
		});
	});
});

// ============================================================================
// STORE OPERATIONS: LARGE DOCUMENTS (~10KB)
// ============================================================================

summary(() => {
	group("Store: Large documents (~10KB)", () => {
		const doc = generateLargeDoc(0);

		bench("add", () => {
			const store = new Store<LargeDoc>();
			store.add(doc, { withId: "doc-0" });
		});

		const storeWithDoc = new Store<LargeDoc>();
		storeWithDoc.add(doc, { withId: "doc-0" });

		bench("get", () => {
			storeWithDoc.get("doc-0");
		});

		bench("update", () => {
			storeWithDoc.update("doc-0", { username: "updated_user" });
		});

		bench("delete", () => {
			const store = new Store<LargeDoc>();
			store.add(doc, { withId: "doc-0" });
			store.del("doc-0");
		});
	});
});

// ============================================================================
// BULK OPERATIONS: BATCH ADD (1000 documents)
// ============================================================================

summary(() => {
	group("Bulk: Batch add 1000 documents", () => {
		const smallDocs = Array.from({ length: 1000 }, (_, i) =>
			generateSmallDoc(i),
		);
		const mediumDocs = Array.from({ length: 1000 }, (_, i) =>
			generateMediumDoc(i),
		);
		const largeDocs = Array.from({ length: 1000 }, (_, i) => generateLargeDoc(i));

		bench("small (~100 bytes each)", () => {
			const store = new Store<SmallDoc>();
			store.begin((tx) => {
				smallDocs.forEach((doc, i) => {
					tx.add(doc, { withId: `doc-${i}` });
				});
			});
		});

		bench("medium (~1KB each)", () => {
			const store = new Store<MediumDoc>();
			store.begin((tx) => {
				mediumDocs.forEach((doc, i) => {
					tx.add(doc, { withId: `doc-${i}` });
				});
			});
		});

		bench("large (~10KB each)", () => {
			const store = new Store<LargeDoc>();
			store.begin((tx) => {
				largeDocs.forEach((doc, i) => {
					tx.add(doc, { withId: `doc-${i}` });
				});
			});
		});
	});
});

// ============================================================================
// BULK OPERATIONS: ITERATION (1000 documents)
// ============================================================================

summary(() => {
	group("Bulk: Iterate 1000 documents", () => {
		const smallStore = new Store<SmallDoc>();
		const smallDocs = Array.from({ length: 1000 }, (_, i) =>
			generateSmallDoc(i),
		);
		smallStore.begin((tx) => {
			smallDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});

		const mediumStore = new Store<MediumDoc>();
		const mediumDocs = Array.from({ length: 1000 }, (_, i) =>
			generateMediumDoc(i),
		);
		mediumStore.begin((tx) => {
			mediumDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});

		const largeStore = new Store<LargeDoc>();
		const largeDocs = Array.from({ length: 1000 }, (_, i) => generateLargeDoc(i));
		largeStore.begin((tx) => {
			largeDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});

		bench("small (~100 bytes each)", () => {
			let count = 0;
			for (const [,] of smallStore.entries()) {
				count++;
			}
		});

		bench("medium (~1KB each)", () => {
			let count = 0;
			for (const [,] of mediumStore.entries()) {
				count++;
			}
		});

		bench("large (~10KB each)", () => {
			let count = 0;
			for (const [,] of largeStore.entries()) {
				count++;
			}
		});
	});
});

// ============================================================================
// BULK OPERATIONS: SNAPSHOT (1000 documents)
// ============================================================================

summary(() => {
	group("Bulk: Snapshot 1000 documents", () => {
		const smallStore = new Store<SmallDoc>();
		const smallDocs = Array.from({ length: 1000 }, (_, i) =>
			generateSmallDoc(i),
		);
		smallStore.begin((tx) => {
			smallDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});

		const mediumStore = new Store<MediumDoc>();
		const mediumDocs = Array.from({ length: 1000 }, (_, i) =>
			generateMediumDoc(i),
		);
		mediumStore.begin((tx) => {
			mediumDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});

		const largeStore = new Store<LargeDoc>();
		const largeDocs = Array.from({ length: 1000 }, (_, i) => generateLargeDoc(i));
		largeStore.begin((tx) => {
			largeDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});

		bench("small (~100 bytes each)", () => {
			smallStore.collection();
		});

		bench("medium (~1KB each)", () => {
			mediumStore.collection();
		});

		bench("large (~10KB each)", () => {
			largeStore.collection();
		});
	});
});

// ============================================================================
// BULK OPERATIONS: MERGE (1000 documents)
// ============================================================================

summary(() => {
	group("Bulk: Merge 1000 documents", () => {
		const smallStore = new Store<SmallDoc>();
		const smallDocs = Array.from({ length: 1000 }, (_, i) =>
			generateSmallDoc(i),
		);
		smallStore.begin((tx) => {
			smallDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});
		const smallCollection = smallStore.collection();

		const mediumStore = new Store<MediumDoc>();
		const mediumDocs = Array.from({ length: 1000 }, (_, i) =>
			generateMediumDoc(i),
		);
		mediumStore.begin((tx) => {
			mediumDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});
		const mediumCollection = mediumStore.collection();

		const largeStore = new Store<LargeDoc>();
		const largeDocs = Array.from({ length: 1000 }, (_, i) => generateLargeDoc(i));
		largeStore.begin((tx) => {
			largeDocs.forEach((doc, i) => {
				tx.add(doc, { withId: `doc-${i}` });
			});
		});
		const largeCollection = largeStore.collection();

		bench("small (~100 bytes each)", () => {
			const store = new Store<SmallDoc>();
			store.merge(smallCollection);
		});

		bench("medium (~1KB each)", () => {
			const store = new Store<MediumDoc>();
			store.merge(mediumCollection);
		});

		bench("large (~10KB each)", () => {
			const store = new Store<LargeDoc>();
			store.merge(largeCollection);
		});
	});
});

await run();
