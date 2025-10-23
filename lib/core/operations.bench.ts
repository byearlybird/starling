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
	const obj = generateDeepObject();
	const timestamp = eventstampFn();

	bench("encode() - single deep nested object", () => {
		resetCounter();
		encode(obj, timestamp);
	});

	const encodedForDecode = encode(generateDeepObject(), eventstampFn());

	bench("decode() - single deep nested object", () => {
		resetCounter();
		decode<DeepNestedObject>(encodedForDecode);
	});

	const objForRoundTrip = generateDeepObject();
	const timestampForRoundTrip = eventstampFn();
	const encodedForRoundTrip = encode(objForRoundTrip, timestampForRoundTrip);

	bench("encode + decode round-trip", () => {
		resetCounter();
		decode<DeepNestedObject>(encodedForRoundTrip);
	});
});

group("Merge Operations - Deep Objects", () => {
	const obj = generateDeepObject();
	const encoded1 = encode(obj, eventstampFn());
	const encoded2 = encode(obj, eventstampFn());

	bench("merge() - two identical deep nested objects", () => {
		resetCounter();
		merge(encoded1, encoded2);
	});

	const obj1 = generateDeepObject();
	const encodedConflict1 = encode(obj1, eventstampFn());

	const obj2 = { ...generateDeepObject() };
	obj2.user.profile.personal.name = "Jane Doe";
	obj2.user.account.subscription.plan = "enterprise";
	const encodedConflict2 = encode(obj2, eventstampFn());

	bench("merge() - conflicting deep nested objects", () => {
		resetCounter();
		merge(encodedConflict1, encodedConflict2);
	});
});

group("Array Merge Operations - Multiple Deep Objects", () => {
	// 100 objects - no conflicts
	const current100 = generateComplexArray(100);
	const updates100 = generateComplexArray(100);
	const encoded100Current = current100.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));
	const encoded100Updates = updates100.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("mergeArray() - 100 objects, no conflicts", () => {
		resetCounter();
		mergeArray(encoded100Current, encoded100Updates);
	});

	// 100 objects - partial updates (25%)
	const encoded100ForPartial = current100.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));
	const updates100Partial = encoded100ForPartial.slice(0, 25).map(({ key, value }) => {
		const modified = { ...value };
		return { key, value: modified };
	});

	bench("mergeArray() - 100 objects, partial updates (25%)", () => {
		resetCounter();
		mergeArray(encoded100ForPartial, updates100Partial);
	});

	// 100 objects - all updated
	const encoded100ForAll = current100.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));
	const updated100 = encoded100ForAll.map(({ key, value }) => {
		const modified: EncodedObject = {};
		for (const [k, v] of Object.entries(value)) {
			modified[k] = {
				__value: typeof v.__value === "object" ? { ...v.__value } : v.__value,
				__eventstamp: eventstampFn(),
			};
		}
		return { key, value: modified };
	});

	bench("mergeArray() - 100 objects, all updated", () => {
		resetCounter();
		mergeArray(encoded100ForAll, updated100);
	});

	// 5000 objects - no conflicts
	const current5000 = generateComplexArray(5000);
	const updates5000 = generateComplexArray(5000);
	const encoded5000Current = current5000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));
	const encoded5000Updates = updates5000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("mergeArray() - 5000 objects, no conflicts", () => {
		resetCounter();
		mergeArray(encoded5000Current, encoded5000Updates);
	});

	// 25000 objects - no conflicts
	const current25000 = generateComplexArray(25000);
	const updates25000 = generateComplexArray(25000);
	const encoded25000Current = current25000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));
	const encoded25000Updates = updates25000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("mergeArray() - 25000 objects, no conflicts", () => {
		resetCounter();
		mergeArray(encoded25000Current, encoded25000Updates);
	});

	// 100000 objects - no conflicts
	const current100000 = generateComplexArray(100000);
	const updates100000 = generateComplexArray(100000);
	const encoded100000Current = current100000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));
	const encoded100000Updates = updates100000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("mergeArray() - 100000 objects, no conflicts", () => {
		resetCounter();
		mergeArray(encoded100000Current, encoded100000Updates);
	});
});

group("Encode/Decode Operations - Arrays", () => {
	// 100 objects
	const items100 = generateComplexArray(100);

	bench("encodeMany() - 100 deep nested objects", () => {
		resetCounter();
		items100.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
	});

	const encoded100ForDecode = items100.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("decodeMany() - 100 deep nested objects", () => {
		resetCounter();
		encoded100ForDecode.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	const encoded100ForRoundTrip = items100.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("encodeMany + decodeMany round-trip - 100 objects", () => {
		resetCounter();
		encoded100ForRoundTrip.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	// 5000 objects
	const items5000 = generateComplexArray(5000);
	const encoded5000 = items5000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("encodeMany + decodeMany round-trip - 5000 objects", () => {
		resetCounter();
		encoded5000.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	// 25000 objects
	const items25000 = generateComplexArray(25000);

	bench("encodeMany() - 25000 deep nested objects", () => {
		resetCounter();
		items25000.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
	});

	const encoded25000ForDecode = items25000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("decodeMany() - 25000 deep nested objects", () => {
		resetCounter();
		encoded25000ForDecode.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	const encoded25000ForRoundTrip = items25000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("encodeMany + decodeMany round-trip - 25000 objects", () => {
		resetCounter();
		encoded25000ForRoundTrip.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	// 100000 objects
	const items100000 = generateComplexArray(100000);

	bench("encodeMany() - 100000 deep nested objects", () => {
		resetCounter();
		items100000.map(({ key, value }) => ({
			key,
			value: encode(value, eventstampFn()),
		}));
	});

	const encoded100000ForDecode = items100000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("decodeMany() - 100000 deep nested objects", () => {
		resetCounter();
		encoded100000ForDecode.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});

	const encoded100000ForRoundTrip = items100000.map(({ key, value }) => ({
		key,
		value: encode(value, eventstampFn()),
	}));

	bench("encodeMany + decodeMany round-trip - 100000 objects", () => {
		resetCounter();
		encoded100000ForRoundTrip.map(({ key, value }) => ({
			key,
			value: decode<DeepNestedObject>(value),
		}));
	});
});

await run();
