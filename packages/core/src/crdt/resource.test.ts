import { expect, test } from "bun:test";
import {
	addEventstamps,
	decodeResource,
	deleteResource,
	mergeResources,
	type ResourceObject,
} from ".";
import { buildMeta, EARLIER, LATER } from "./test-utils";

const RESOURCE_TYPE = "users";

test("addEventstamps creates parallel structure", () => {
	const [attrs, events] = addEventstamps(
		{ name: "Alice", age: 30, user: { email: "a@b.com" } },
		EARLIER,
	);

	expect(attrs).toEqual({ name: "Alice", age: 30, user: { email: "a@b.com" } });
	expect(events).toEqual({
		name: EARLIER,
		age: EARLIER,
		user: { email: EARLIER },
	});
});

test("addEventstamps throws error for non-object values", () => {
	expect(() => addEventstamps("not an object", EARLIER)).toThrow(
		/must be an object/,
	);
	expect(() => addEventstamps(42, EARLIER)).toThrow(/must be an object/);
	expect(() => addEventstamps(null, EARLIER)).toThrow(/must be an object/);
});

test("addEventstamps treats arrays as atomic values", () => {
	const [attrs, events] = addEventstamps(
		{ tags: ["admin", "user"], scores: [95, 87] },
		EARLIER,
	);

	expect(attrs.tags).toEqual(["admin", "user"]);
	expect(attrs.scores).toEqual([95, 87]);
	expect(events.tags).toBe(EARLIER);
	expect(events.scores).toBe(EARLIER);
});

test("decodeResource extracts plain data", () => {
	const [attrs, events] = addEventstamps(
		{ name: "Alice", age: 30, user: { email: "a@b.com" } },
		EARLIER,
	);

	const resource: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrs,
		meta: buildMeta(events, EARLIER),
	};

	const decoded = decodeResource(resource);

	expect(decoded.type).toBe(RESOURCE_TYPE);
	expect(decoded.id).toBe("user-1");
	expect(decoded.data).toEqual({
		name: "Alice",
		age: 30,
		user: { email: "a@b.com" },
	});
	expect(decoded.meta["~deletedAt"]).toBe(null);
});

test("mergeResources uses field-level Last-Write-Wins", () => {
	const [attrsA, eventsA] = addEventstamps(
		{ name: "Alice", age: 30, status: "active" },
		EARLIER,
	);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsA,
		meta: buildMeta(eventsA, EARLIER),
	};

	const [attrsB, eventsB] = addEventstamps({ name: "Bob", age: 25 }, LATER);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsB,
		meta: buildMeta(eventsB, LATER),
	};

	const merged = mergeResources(resourceA, resourceB);
	const decoded = decodeResource(merged);

	expect(decoded.data.name).toBe("Bob");
	expect(decoded.data.age).toBe(25);
	expect(decoded.data.status).toBe("active");
	expect(merged.meta["~eventstamp"]).toBe(LATER);
});

test("mergeResources handles deletion timestamps", () => {
	const [attrsA, eventsA] = addEventstamps({ name: "Alice" }, EARLIER);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsA,
		meta: buildMeta(eventsA, EARLIER),
	};

	const [attrsB, eventsB] = addEventstamps({ name: "Alice" }, LATER);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrsB,
		meta: buildMeta(eventsB, LATER, LATER),
	};

	const merged = mergeResources(resourceA, resourceB);

	expect(merged.meta["~deletedAt"]).toBe(LATER);
	expect(merged.meta["~eventstamp"]).toBe(LATER);
});

test("deleteResource marks a resource as deleted", () => {
	const [attrs, events] = addEventstamps({ name: "Alice" }, EARLIER);
	const resource: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "user-1",
		attributes: attrs,
		meta: buildMeta(events, EARLIER),
	};

	const deleted = deleteResource(resource, LATER);

	expect(deleted.meta["~deletedAt"]).toBe(LATER);
	expect(deleted.attributes).toEqual(resource.attributes);
	expect(deleted.meta["~eventstamps"]).toEqual(resource.meta["~eventstamps"]);
});

test("mergeResources handles nested objects", () => {
	const [attrsA, eventsA] = addEventstamps(
		{ user: { name: "Alice", age: 30 } },
		EARLIER,
	);
	const resourceA: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrsA,
		meta: buildMeta(eventsA, EARLIER),
	};

	const [attrsB, eventsB] = addEventstamps(
		{ user: { name: "Bob", email: "bob@example.com" } },
		LATER,
	);
	const resourceB: ResourceObject = {
		type: RESOURCE_TYPE,
		id: "res-1",
		attributes: attrsB,
		meta: buildMeta(eventsB, LATER),
	};

	const merged = mergeResources(resourceA, resourceB);
	const decoded = decodeResource(merged);
	const user = decoded.data.user as Record<string, unknown>;

	expect(user.name).toBe("Bob");
	expect(user.age).toBe(30);
	expect(user.email).toBe("bob@example.com");
});
