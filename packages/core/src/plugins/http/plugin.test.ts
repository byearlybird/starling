import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Collection } from "../../crdt";
import { Store } from "../../store";
import { httpPlugin } from "./plugin";

type Todo = {
	label: string;
	completed: boolean;
};

// Mock HTTP server state
let serverData = new Map<string, Collection>();

// Mock fetch implementation
type MockFetchResponse = {
	ok: boolean;
	status: number;
	statusText: string;
	json: () => Promise<unknown>;
};

let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];

const mockFetch = async (
	url: string | URL,
	options?: RequestInit,
): Promise<MockFetchResponse> => {
	const urlString = url.toString();
	const method = options?.method || "GET";
	const body = options?.body as string | undefined;

	// Track the call
	fetchCalls.push({ url: urlString, method, body });

	if (method === "GET") {
		const data = serverData.get(urlString);
		if (!data) {
			return {
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => null,
			};
		}
		return {
			ok: true,
			status: 200,
			statusText: "OK",
			json: async () => data,
		};
	}

	if (method === "POST" || method === "PUT" || method === "PATCH") {
		if (body) {
			const data = JSON.parse(body) as Collection;
			serverData.set(urlString, data);
		}
		return {
			ok: true,
			status: 200,
			statusText: "OK",
			json: async () => ({}),
		};
	}

	return {
		ok: false,
		status: 405,
		statusText: "Method Not Allowed",
		json: async () => ({}),
	};
};

beforeEach(() => {
	serverData = new Map();
	fetchCalls = [];
});

afterEach(() => {
	serverData.clear();
	fetchCalls = [];
});

test("initializes empty store when no data on server", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	expect(Array.from(store.entries())).toEqual([]);
	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("GET");
	await store.dispose();
});

test("initializes store with remote data", async () => {
	// Pre-populate server with data
	const store1 = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	store1.begin((tx) => {
		tx.add({ label: "Test", completed: false }, { withId: "todo1" });
	});

	// Wait for persistence
	await new Promise((resolve) => setTimeout(resolve, 10));
	await store1.dispose();

	// Create a new store - should load from server
	fetchCalls = []; // Reset call tracking
	const store2 = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
	expect(fetchCalls[0]?.method).toBe("GET");
	await store2.dispose();
});

test("persists add operation to server", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	fetchCalls = []; // Reset after init

	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	// Wait for persistence
	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("POST");
	expect(fetchCalls[0]?.body).toBeDefined();

	const persisted = serverData.get("https://api.example.com/todos");
	expect(persisted).toBeDefined();
	expect(persisted?.["~docs"].length).toBe(1);
	expect(persisted?.["~docs"][0]?.["~id"]).toBe("todo1");

	await store.dispose();
});

test("persists update operation to server", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	fetchCalls = []; // Reset

	store.begin((tx) => {
		tx.update("todo1", { completed: true });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("POST");
	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });

	await store.dispose();
});

test("persists delete operation to server", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	fetchCalls = []; // Reset

	store.begin((tx) => {
		tx.del("todo1");
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("POST");
	expect(store.get("todo1")).toBeNull();

	await store.dispose();
});

test("debounces server writes when debounceMs is set", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				debounceMs: 100,
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	fetchCalls = []; // Reset after init

	// Rapid writes should be batched
	store.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});
	store.begin((tx) => {
		tx.add({ label: "Task 2", completed: false }, { withId: "todo2" });
	});

	// No writes should have happened yet
	expect(fetchCalls.length).toBe(0);

	// Wait for debounce to complete
	await new Promise((resolve) => setTimeout(resolve, 150));

	// Should only have 1 write despite 2 mutations
	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("POST");

	await store.dispose();
});

test("forwards store clock to remote eventstamp on load", async () => {
	// Create a store and add data
	const store1 = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	store1.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});

	// Wait for persistence
	await new Promise((resolve) => setTimeout(resolve, 10));
	const persistedEventstamp = store1.collection()["~eventstamp"];
	await store1.dispose();

	// Create a new store that loads the data
	const store2 = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	// The new store's clock should have been forwarded
	const store2Latest = store2.collection()["~eventstamp"];
	expect(store2Latest >= persistedEventstamp).toBe(true);

	// New writes should have higher eventstamps
	const beforeTimestamp = store2Latest;
	store2.begin((tx) => {
		tx.add({ label: "Task 2", completed: false }, { withId: "todo2" });
	});
	const afterTimestamp = store2.collection()["~eventstamp"];
	expect(afterTimestamp > beforeTimestamp).toBe(true);

	await store2.dispose();
});

test("disposes only after pending debounced writes complete", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				debounceMs: 500,
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	fetchCalls = []; // Reset after init

	// Perform a mutation - this schedules a write
	store.begin((tx) => {
		tx.add({ label: "Urgent task", completed: false }, { withId: "todo1" });
	});

	// Verify nothing is persisted yet
	expect(fetchCalls.length).toBe(0);

	// Dispose immediately (before debounce completes)
	await store.dispose();

	// The write should have completed
	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("POST");

	const persisted = serverData.get("https://api.example.com/todos");
	expect(persisted?.["~docs"].length).toBe(1);
});

test("supports custom HTTP method (PUT)", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				method: "PUT",
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	fetchCalls = []; // Reset after init

	store.begin((tx) => {
		tx.add({ label: "Custom", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(fetchCalls.length).toBe(1);
	expect(fetchCalls[0]?.method).toBe("PUT");

	await store.dispose();
});

test("supports polling for remote changes", async () => {
	const store1 = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	// Add initial data
	store1.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));
	await store1.dispose();

	// Create a second store with polling
	const store2 = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				pollIntervalMs: 100,
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	expect(store2.get("todo1")).toEqual({ label: "Task 1", completed: false });

	// Simulate external update to server
	const collection = serverData.get("https://api.example.com/todos")!;
	const updatedCollection: Collection = {
		...collection,
		"~docs": [
			...collection["~docs"],
			{
				"~id": "todo2",
				"~data": {
					label: ["Task 2", "2025-01-01T00:00:00.000Z|0001|abcd"],
					completed: [false, "2025-01-01T00:00:00.000Z|0001|abcd"],
				},
				"~deletedAt": null,
			},
		],
	};
	serverData.set("https://api.example.com/todos", updatedCollection);

	// Wait for polling to pick up the change
	await new Promise((resolve) => setTimeout(resolve, 150));

	// Store should have the new todo
	expect(store2.get("todo2")).toBeDefined();

	await store2.dispose();
});

test("supports custom headers", async () => {
	let capturedHeaders: HeadersInit | undefined;

	const customFetch = async (
		url: string | URL,
		options?: RequestInit,
	): Promise<MockFetchResponse> => {
		capturedHeaders = options?.headers;
		return mockFetch(url, options);
	};

	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				headers: { Authorization: "Bearer token123" },
				fetch: customFetch as unknown as typeof fetch,
			}),
		)
		.init();

	expect(capturedHeaders).toBeDefined();
	expect((capturedHeaders as Record<string, string>)?.Authorization).toBe(
		"Bearer token123",
	);

	await store.dispose();
});

test("skips sync when skip returns true", async () => {
	let shouldSkip = false;

	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				skip: () => shouldSkip,
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	fetchCalls = []; // Reset after init

	// Enable skip
	shouldSkip = true;

	store.begin((tx) => {
		tx.add({ label: "Skipped", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	// No fetch should have happened
	expect(fetchCalls.length).toBe(0);

	// Disable skip
	shouldSkip = false;

	store.begin((tx) => {
		tx.update("todo1", { completed: true });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	// Now fetch should happen
	expect(fetchCalls.length).toBe(1);

	await store.dispose();
});

test("supports syncOnInit: false", async () => {
	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				syncOnInit: false,
				fetch: mockFetch as unknown as typeof fetch,
			}),
		)
		.init();

	// No fetch should have happened during init
	expect(fetchCalls.length).toBe(0);

	await store.dispose();
});

test("handles network errors gracefully", async () => {
	const failingFetch = async (): Promise<MockFetchResponse> => {
		throw new Error("Network error");
	};

	const store = await new Store<Todo>()
		.use(
			httpPlugin("https://api.example.com/todos", {
				fetch: failingFetch as unknown as typeof fetch,
			}),
		)
		.init();

	// Should not throw, just log error
	store.begin((tx) => {
		tx.add({ label: "Task", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	// Store should still work locally
	expect(store.get("todo1")).toEqual({ label: "Task", completed: false });

	await store.dispose();
});
