import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
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

const isObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};

const mapLeafValues = (
	obj: unknown,
	fn: (value: unknown) => unknown,
): unknown => {
	if (isObject(obj)) {
		return Object.fromEntries(
			Object.entries(obj).map(([key, value]) => [
				key,
				mapLeafValues(value, fn),
			]),
		);
	}
	return fn(obj);
};

const localStorage = unstoragePlugin<Task>(
	createStorage({
		driver: localStorageDriver({ base: "starling-todos:" }),
	}),
);

const remoteStorage = unstoragePlugin<Task>(
	createStorage({
		driver: httpDriver({ base: "http://localhost:3001/api" }),
	}),
	{
		skip: () => !navigator.onLine,
		pollIntervalMs: 1000, // set to 1 second for demo purposes,
		onBeforeSet: (data) => ({
			...data,
			data: data.data.map((doc) => ({
				...doc,
				// cast encrypted attributes to Task so the returned Document matches the expected type
				attributes: mapLeafValues(
					doc.attributes,
					pseudoEncrypt,
				) as unknown as Task,
			})),
		}),
		onAfterGet: (data) => ({
			...data,
			data: data.data.map((doc) => ({
				...doc,
				// cast decrypted attributes to Task so the Document<ResourceObject> type matches
				attributes: mapLeafValues(
					doc.attributes,
					pseudoDecrypt,
				) as unknown as Task,
			})),
		}),
	},
);

// Create Starling store with local storage and HTTP Sync
const taskStore = await createStore<Task>("tasks")
	.use(queryPlugin())
	.use(localStorage)
	.use(remoteStorage)
	.init();

// Create typed hooks from the store - use these in components
export const { StoreProvider, useStore, useQuery } =
	createStoreHooks(taskStore);
