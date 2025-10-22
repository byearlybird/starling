import { bench, group, run } from "mitata";
import { decode, encode, merge, mergeArray } from "./operations";
import type { ArrayKV, EncodedObject } from "./types";

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

// Deep nested object structure for stress testing
interface DeepNestedObject {
	user: {
		profile: {
			personal: {
				name: string;
				age: number;
				contact: {
					email: string;
					phone: string;
					address: {
						street: string;
						city: string;
						country: string;
						coordinates: {
							lat: number;
							lng: number;
						};
					};
				};
			};
			settings: {
				theme: string;
				notifications: {
					email: boolean;
					sms: boolean;
					push: boolean;
					preferences: {
						frequency: string;
						channels: string[];
					};
				};
				privacy: {
					public: boolean;
					shareProfile: boolean;
					shareActivity: boolean;
				};
			};
		};
		account: {
			subscription: {
				plan: string;
				startDate: string;
				endDate: string;
				features: {
					storage: number;
					users: number;
					apiCalls: number;
				};
				billing: {
					method: string;
					lastCharge: string;
					nextBilling: string;
				};
			};
			security: {
				twoFactorEnabled: boolean;
				lastLogin: string;
				loginAttempts: number;
			};
		};
	};
	metadata: {
		created: string;
		modified: string;
		tags: string[];
	};
}

// Generate deep nested object
const generateDeepObject = (): DeepNestedObject => ({
	user: {
		profile: {
			personal: {
				name: "John Doe",
				age: 30,
				contact: {
					email: "john@example.com",
					phone: "+1234567890",
					address: {
						street: "123 Main St",
						city: "New York",
						country: "USA",
						coordinates: {
							lat: 40.7128,
							lng: -74.006,
						},
					},
				},
			},
			settings: {
				theme: "dark",
				notifications: {
					email: true,
					sms: false,
					push: true,
					preferences: {
						frequency: "daily",
						channels: ["email", "push", "in-app"],
					},
				},
				privacy: {
					public: false,
					shareProfile: true,
					shareActivity: false,
				},
			},
		},
		account: {
			subscription: {
				plan: "pro",
				startDate: "2024-01-01",
				endDate: "2025-01-01",
				features: {
					storage: 1000,
					users: 50,
					apiCalls: 1000000,
				},
				billing: {
					method: "credit_card",
					lastCharge: "2024-10-22",
					nextBilling: "2024-11-22",
				},
			},
			security: {
				twoFactorEnabled: true,
				lastLogin: "2024-10-22T10:30:00Z",
				loginAttempts: 3,
			},
		},
	},
	metadata: {
		created: "2024-01-01T00:00:00Z",
		modified: "2024-10-22T10:30:00Z",
		tags: ["important", "archived", "verified", "premium"],
	},
});

// Simulate array of complex objects
const generateComplexArray = (count: number): ArrayKV<DeepNestedObject> => {
	const cities = ["New York", "Los Angeles", "Chicago"] as const;
	const plans = ["free", "pro", "enterprise"] as const;
	const frequencies = ["daily", "weekly", "monthly"] as const;

	return Array.from({ length: count }, (_, i) => ({
		key: `user-${i}`,
		value: {
			user: {
				profile: {
					personal: {
						name: `User ${i}`,
						age: 20 + (i % 50),
						contact: {
							email: `user${i}@example.com`,
							phone: `+1${String(i).padStart(9, "0")}`,
							address: {
								street: `${100 + i} Main St`,
								city: cities[i % cities.length],
								country: "USA",
								coordinates: {
									lat: 40.7128 + i * 0.001,
									lng: -74.006 + i * 0.001,
								},
							},
						},
					},
					settings: {
						theme: i % 2 === 0 ? "dark" : "light",
						notifications: {
							email: i % 3 !== 0,
							sms: i % 4 === 0,
							push: true,
							preferences: {
								frequency: frequencies[i % frequencies.length],
								channels: ["email", "push"].slice(0, (i % 2) + 1),
							},
						},
						privacy: {
							public: i % 5 === 0,
							shareProfile: i % 2 === 0,
							shareActivity: false,
						},
					},
				},
				account: {
					subscription: {
						plan: plans[i % plans.length],
						startDate: "2024-01-01",
						endDate: "2025-01-01",
						features: {
							storage: 100 * ((i % 10) + 1),
							users: 5 * ((i % 20) + 1),
							apiCalls: 10000 * ((i % 100) + 1),
						},
						billing: {
							method: "credit_card",
							lastCharge: "2024-10-22",
							nextBilling: "2024-11-22",
						},
					},
					security: {
						twoFactorEnabled: i % 2 === 0,
						lastLogin: "2024-10-22T10:30:00Z",
						loginAttempts: i % 10,
					},
				},
			},
			metadata: {
				created: "2024-01-01T00:00:00Z",
				modified: "2024-10-22T10:30:00Z",
				tags: [`tag-${i}`, "verified", "active"],
			},
		},
	}));
};

group("Encode Operations - Single Objects", () => {
	bench("encode() - single deep nested object", () => {
		resetCounter();
		const obj = generateDeepObject();
		encode(obj, eventstampFn());
	});

	bench("decode() - single deep nested object", () => {
		resetCounter();
		const obj = generateDeepObject();
		const encoded = encode(obj, eventstampFn());
		decode<DeepNestedObject>(encoded);
	});

	bench("encode + decode round-trip", () => {
		resetCounter();
		const obj = generateDeepObject();
		const encoded = encode(obj, eventstampFn());
		decode<DeepNestedObject>(encoded);
	});
});

group("Merge Operations - Deep Objects", () => {
	bench("merge() - two identical deep nested objects", () => {
		resetCounter();
		const obj = generateDeepObject();
		const encoded1 = encode(obj, eventstampFn());
		const encoded2 = encode(obj, eventstampFn());
		merge(encoded1, encoded2);
	});

	bench("merge() - conflicting deep nested objects", () => {
		resetCounter();
		const obj1 = generateDeepObject();
		const encoded1 = encode(obj1, eventstampFn());

		const obj2 = { ...generateDeepObject() };
		obj2.user.profile.personal.name = "Jane Doe";
		obj2.user.account.subscription.plan = "enterprise";
		const encoded2 = encode(obj2, eventstampFn());

		merge(encoded1, encoded2);
	});
});

group("Array Merge Operations - Multiple Deep Objects", () => {
	bench("mergeArray() - 100 objects, no conflicts", () => {
		resetCounter();
		const current = generateComplexArray(100);
		const updates = generateComplexArray(100);
		mergeArray(
			current.map(({ key, value }) => ({
				key,
				value: encode(value, eventstampFn()),
			})),
			updates.map(({ key, value }) => ({
				key,
				value: encode(value, eventstampFn()),
			})),
		);
	});

	bench("mergeArray() - 100 objects, partial updates (25%)", () => {
		resetCounter();
		const current = generateComplexArray(100);
		const encoded = current.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));

		// Create updates for only 25% of items
		const updates = encoded.slice(0, 25).map(({ key, value }) => {
			const modified = { ...value };
			return { key, value: modified };
		});

		mergeArray(encoded, updates);
	});

	bench("mergeArray() - 100 objects, all updated", () => {
		resetCounter();
		const current = generateComplexArray(100);
		const encoded1 = current.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));

		const updated = encoded1.map(({ key, value }) => {
			const modified: EncodedObject = {};
			for (const [k, v] of Object.entries(value)) {
				modified[k] = {
					__value: typeof v.__value === "object" ? { ...v.__value } : v.__value,
					__eventstamp: eventstampFn(),
				};
			}
			return { key, value: modified };
		});

		mergeArray(encoded1, updated);
	});

	bench("mergeArray() - 500 objects, no conflicts", () => {
		resetCounter();
		const current = generateComplexArray(500);
		const updates = generateComplexArray(500);
		mergeArray(
			current.map(({ key, value }) => ({
				key,
				value: encode(value, eventstampFn()),
			})),
			updates.map(({ key, value }) => ({
				key,
				value: encode(value, eventstampFn()),
			})),
		);
	});

	bench("mergeArray() - 4000 objects, no conflicts", () => {
		resetCounter();
		const current = generateComplexArray(4000);
		const updates = generateComplexArray(4000);
		mergeArray(
			current.map(({ key, value }) => ({
				key,
				value: encode(value, eventstampFn()),
			})),
			updates.map(({ key, value }) => ({
				key,
				value: encode(value, eventstampFn()),
			})),
		);
	});
});

group("Encode/Decode Operations - Arrays", () => {
	bench("encodeMany() - 100 deep nested objects", () => {
		resetCounter();
		const items = generateComplexArray(100);
		items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
	});

	bench("decodeMany() - 100 deep nested objects", () => {
		resetCounter();
		const items = generateComplexArray(100);
		const encoded = items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
		encoded.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	bench("encodeMany + decodeMany round-trip - 100 objects", () => {
		resetCounter();
		const items = generateComplexArray(100);
		const encoded = items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
		encoded.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	bench("encodeMany + decodeMany round-trip - 500 objects", () => {
		resetCounter();
		const items = generateComplexArray(500);
		const encoded = items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
		encoded.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	bench("encodeMany() - 4000 deep nested objects", () => {
		resetCounter();
		const items = generateComplexArray(4000);
		items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
	});

	bench("decodeMany() - 4000 deep nested objects", () => {
		resetCounter();
		const items = generateComplexArray(4000);
		const encoded = items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
		encoded.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	bench("encodeMany + decodeMany round-trip - 4000 objects", () => {
		resetCounter();
		const items = generateComplexArray(4000);
		const encoded = items.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
		encoded.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});
});

await run();
