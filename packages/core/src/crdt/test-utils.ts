import type { Document } from "./document";
import { createResource, type ResourceObject } from "./resource";

export const EARLIER = "2025-01-01T00:00:00.000Z|0000|a1b2";
export const LATER = "2025-01-01T00:01:00.000Z|0000|c3d4";
export const LATEST = "2025-01-01T00:02:00.000Z|0000|e5f6";

export const TEST_RESOURCE_TYPE = "test-users";

export type TestUser = {
	name: string;
	email?: string;
	age?: number;
	profile?: {
		bio?: string;
		avatar?: string;
		location?: string;
	};
};

export function mkEventstamp(minutes: number): string {
	const min = String(minutes).padStart(2, "0");
	const nonce = Math.floor(Math.random() * 65536)
		.toString(16)
		.padStart(4, "0");
	return `2025-01-01T00:${min}:00.000Z|0000|${nonce}`;
}

export function buildResource(
	id: string,
	data: Record<string, unknown>,
	eventstamp: string,
	deletedAt: string | null = null,
	type = TEST_RESOURCE_TYPE,
): ResourceObject {
	return createResource(type, id, data, eventstamp, deletedAt);
}

export function buildMeta(
	eventstamps: Record<string, unknown>,
	eventstamp: string,
	deletedAt: string | null = null,
): ResourceObject["meta"] {
	return {
		"~eventstamps": eventstamps,
		"~deletedAt": deletedAt,
		"~eventstamp": eventstamp,
	};
}

export function mapFromResources(
	...resources: ResourceObject[]
): Map<string, ResourceObject> {
	return new Map(resources.map((resource) => [resource.id, resource] as const));
}

export function makeDocument(
	resources: ResourceObject[],
	eventstamp: string,
): Document {
	return {
		data: resources,
		meta: { "~eventstamp": eventstamp },
	};
}

export const delay = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export const ALICE_DATA = { name: "Alice", email: "alice@example.com" };
export const BOB_DATA = { name: "Bob" };
export const CHARLIE_DATA = { name: "Charlie" };
