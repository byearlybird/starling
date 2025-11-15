import type { Document, ResourceObject } from "@byearlybird/starling/crdt";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { Store } from "@byearlybird/starling/store";
import { createStoreHooks } from "@byearlybird/starling-solid";
import { createStorage } from "unstorage";
import httpDriver from "unstorage/drivers/http";
import localStorageDriver from "unstorage/drivers/localstorage";
import { z } from "zod";

export const statusSchema = z.enum(["todo", "doing", "done"]);

export const subtaskSchema = z.object({
	title: z.string(),
	status: statusSchema,
});

export const taskSchema = z.object({
	status: statusSchema.default("todo"),
	title: z.string().min(1),
	tags: z.array(z.string()).default([]),
	createdAt: z.string().default(() => new Date().toISOString()),
	subtasks: z.record(z.string(), subtaskSchema).default({}),
	priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export type Task = z.infer<typeof taskSchema>;
export type Subtask = z.infer<typeof subtaskSchema>;
export type Status = z.infer<typeof statusSchema>;

const pseudoEncrypt = (data: unknown): string => {
	const jsonString = JSON.stringify(data);
	return btoa(jsonString);
};

const pseudoDecrypt = (encrypted: unknown): unknown => {
	if (typeof encrypted !== "string") {
		throw new Error("Expected encrypted data to be a string");
	}
	const jsonString = atob(encrypted);
	return JSON.parse(jsonString);
};

/**
 * Transform document attributes by applying a transformation function to each resource
 */
const transformDocument = (
	data: Document,
	transform: (attributes: Record<string, unknown>) => Record<string, unknown>,
): Document => ({
	...data,
	data: data.data.map(
		(resource: ResourceObject): ResourceObject => ({
			...resource,
			attributes: transform(resource.attributes),
		}),
	),
});

const localStorage = unstoragePlugin<Task>(
	"tasks",
	createStorage({
		driver: localStorageDriver({ base: "starling-todos:" }),
	}),
);

const remoteStorage = unstoragePlugin<Task>(
	"tasks",
	createStorage({
		driver: httpDriver({ base: "http://localhost:3001/api" }),
	}),
	{
		skip: () => !navigator.onLine,
		pollIntervalMs: 1000, // set to 1 second for demo purposes
		onBeforeSet: (data: Document) =>
			transformDocument(data, (attrs) => ({
				...attrs,
				encrypted: pseudoEncrypt(attrs),
			})),
		onAfterGet: (data: Document) =>
			transformDocument(data, (attrs) => {
				// Decrypt if the encrypted field exists, otherwise return as-is
				if ("encrypted" in attrs && typeof attrs.encrypted === "string") {
					return pseudoDecrypt(attrs.encrypted) as Record<string, unknown>;
				}
				return attrs;
			}),
	},
);

// Create Starling store with local storage and HTTP Sync
const taskStore = await new Store<Task>({ resourceType: "tasks" })
	.use(localStorage)
	.use(remoteStorage)
	.init();

// Create typed hooks from the store - use these in components
export const { StoreProvider, useStore, useQuery } =
	createStoreHooks(taskStore);
