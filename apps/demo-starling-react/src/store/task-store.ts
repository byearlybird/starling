import { createStore, processDocument } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
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
		onBeforeSet: (data) => ({
			...data,
			docs: data["~docs"].map((doc) =>
				processDocument(doc, (value) => ({
					...value,
					"~value": pseudoEncrypt(value["~value"]),
				})),
			),
		}),
		onAfterGet: (data) => ({
			...data,
			docs: data["~docs"].map((doc) =>
				processDocument(doc, (value) => ({
					...value,
					"~value": pseudoDecrypt(value["~value"]),
				})),
			),
		}),
	},
);

// Create Starling store with local storage and HTTP Sync
export const taskStore = await createStore<Task>()
	.use(localStorage)
	.use(remoteStorage)
	.use(queryPlugin())
	.init();

export const todoTasksQuery = taskStore.query({
	where: (task) => task.status === "todo",
});

export const doingTasksQuery = taskStore.query({
	where: (task) => task.status === "doing",
});

export const doneTasksQuery = taskStore.query({
	where: (task) => task.status === "done",
});
