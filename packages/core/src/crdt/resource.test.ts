import { expect, test } from "bun:test";
import {
	addEventstamps,
	decodeResource,
	deleteResource,
	mergeResources,
	type ResourceObject,
} from ".";

const RESOURCE_TYPE = "users";

test("addEventstamps creates parallel structure with eventstamps", () => {
	const [attrs, events] = addEventstamps(
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	expect(attrs).toEqual({ name: "Alice", age: 30 });
	expect(events).toEqual({
		name: "2025-01-01T00:00:00.000Z|0000|a1b2",
		age: "2025-01-01T00:00:00.000Z|0000|a1b2",
	});
});

test("addEventstamps handles nested objects", () => {
	const [attrs, events] = addEventstamps(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	expect(attrs).toEqual({
		user: { name: "Bob", email: "bob@example.com" },
	});
	expect(events.user as Record<string, unknown>).toEqual({
		name: "2025-01-01T00:00:00.000Z|0000|a1b2",
		email: "2025-01-01T00:00:00.000Z|0000|a1b2",
	});
});

test("addEventstamps handles deeply nested objects", () => {
	const [_attrs, events] = addEventstamps(
		{ a: { b: { c: "value" } } },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const eventA = events.a as Record<string, unknown>;
	const eventB = eventA.b as Record<string, unknown>;
	expect(eventB.c).toBe("2025-01-01T00:00:00.000Z|0000|a1b2");
});

test("addEventstamps throws error for non-object values", () => {
	expect(() =>
		addEventstamps("not an object", "2025-01-01T00:00:00.000Z|0000|a1b2"),
	).toThrow(/must be an object/);
	expect(() =>
		addEventstamps(42, "2025-01-01T00:00:00.000Z|0000|a1b2"),
	).toThrow(/must be an object/);
	expect(() =>
		addEventstamps(null, "2025-01-01T00:00:00.000Z|0000|a1b2"),
	).toThrow(/must be an object/);
});

test("addEventstamps preserves arrays as leaf values", () => {
	const [attrs, events] = addEventstamps(
		{ tags: ["admin", "user"], scores: [95, 87] },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	expect(attrs.tags).toEqual(["admin", "user"]);
	expect(attrs.scores).toEqual([95, 87]);
	expect(events.tags).toBe("2025-01-01T00:00:00.000Z|0000|a1b2");
	expect(events.scores).toBe("2025-01-01T00:00:00.000Z|0000|a1b2");
});

test("decodeResource extracts plain data from ResourceObject", () => {
	const [attrs, events] = addEventstamps(
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const resource: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrs,
		meta: {
			"~eventstamps": events,
			"~deletedAt": null,
		},
	};

	const decoded = decodeResource(resource);

	expect(decoded.type).toBe(RESOURCE_TYPE);
	expect(decoded.id).toBe("user-1");
	expect(decoded.data).toEqual({ name: "Alice", age: 30 });
	expect(decoded.meta["~deletedAt"]).toBe(null);
});

test("decodeResource handles nested objects", () => {
	const [attrs, events] = addEventstamps(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const resource: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrs,
		meta: {
			"~eventstamps": events,
			"~deletedAt": null,
		},
	};

	const decoded = decodeResource(resource);
	const user = decoded.data.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.email).toBe("bob@example.com");
});

test("mergeResources uses field-level Last-Write-Wins", () => {
	const [attrsA, eventsA] = addEventstamps(
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsA,
		meta: { "~eventstamps": eventsA, "~deletedAt": null },
	};

	const [attrsB, eventsB] = addEventstamps(
		{ name: "Bob", age: 25 },
		"2025-01-01T00:00:01.000Z|0000|c3d4",
	);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsB,
		meta: { "~eventstamps": eventsB, "~deletedAt": null },
	};

	const [merged, maxEventstamp] = mergeResources(resourceA, resourceB);

	const decoded = decodeResource(merged);
	expect(decoded.data.name).toBe("Bob");
	expect(decoded.data.age).toBe(25);
	expect(maxEventstamp).toBe("2025-01-01T00:00:01.000Z|0000|c3d4");
});

test("mergeResources preserves older value when it has newer eventstamp", () => {
	const [attrsA, eventsA] = addEventstamps(
		{ status: "active" },
		"2025-01-01T00:00:05.000Z|0000|e5f6",
	);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrsA,
		meta: { "~eventstamps": eventsA, "~deletedAt": null },
	};

	const [attrsB, eventsB] = addEventstamps(
		{ status: "inactive" },
		"2025-01-01T00:00:01.000Z|0000|c3d4",
	);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrsB,
		meta: { "~eventstamps": eventsB, "~deletedAt": null },
	};

	const [merged] = mergeResources(resourceA, resourceB);

	const decoded = decodeResource(merged);
	expect(decoded.data.status).toBe("active");
});

test("mergeResources handles deletion timestamps", () => {
	const [attrsA, eventsA] = addEventstamps(
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsA,
		meta: { "~eventstamps": eventsA, "~deletedAt": null },
	};

	const [attrsB, eventsB] = addEventstamps(
		{ name: "Alice" },
		"2025-01-01T00:00:01.000Z|0000|c3d4",
	);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsB,
		meta: {
			"~eventstamps": eventsB,
			"~deletedAt": "2025-01-01T00:00:01.000Z|0000|c3d4",
		},
	};

	const [merged, maxEventstamp] = mergeResources(resourceA, resourceB);

	expect(merged.meta["~deletedAt"]).toBe("2025-01-01T00:00:01.000Z|0000|c3d4");
	expect(maxEventstamp).toBe("2025-01-01T00:00:01.000Z|0000|c3d4");
});

test("deleteResource marks a resource as deleted", () => {
	const [attrs, events] = addEventstamps(
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const resource: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrs,
		meta: { "~eventstamps": events, "~deletedAt": null },
	};

	const deleted = deleteResource(
		resource,
		"2025-01-01T00:00:05.000Z|0000|e5f6",
	);

	expect(deleted.meta["~deletedAt"]).toBe("2025-01-01T00:00:05.000Z|0000|e5f6");
	expect(deleted.attributes).toEqual(resource.attributes);
	expect(deleted.meta["~eventstamps"]).toEqual(resource.meta["~eventstamps"]);
});

test("mergeResources handles nested objects", () => {
	const [attrsA, eventsA] = addEventstamps(
		{ user: { name: "Alice", age: 30 } },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrsA,
		meta: { "~eventstamps": eventsA, "~deletedAt": null },
	};

	const [attrsB, eventsB] = addEventstamps(
		{ user: { name: "Bob", email: "bob@example.com" } },
		"2025-01-01T00:00:01.000Z|0000|c3d4",
	);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrsB,
		meta: { "~eventstamps": eventsB, "~deletedAt": null },
	};

	const [merged] = mergeResources(resourceA, resourceB);

	const decoded = decodeResource(merged);
	const user = decoded.data.user as Record<string, unknown>;
	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");
});
