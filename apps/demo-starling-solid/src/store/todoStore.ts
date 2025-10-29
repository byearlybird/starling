import { createStore, processDocument } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling-plugin-query";
import { unstoragePlugin } from "@byearlybird/starling-plugin-unstorage";
import { createStorage } from "unstorage";
import httpDriver from "unstorage/drivers/http";
import localStorageDriver from "unstorage/drivers/localstorage";

export type Todo = {
	text: string;
	completed: boolean;
};

const pseudoEncrypt = (data: unknown): string => {
	const jsonString = JSON.stringify(data);
	return Buffer.from(jsonString).toString("base64");
};

const pseudoDecrypt = (encrypted: unknown): unknown => {
	if (typeof encrypted !== "string") {
		throw new Error("Expected encrypted data to be a string");
	}
	const jsonString = Buffer.from(encrypted, "base64").toString("utf-8");
	return JSON.parse(jsonString);
};

const localStorage = unstoragePlugin<Todo>(
	"todos",
	createStorage({
		driver: localStorageDriver({ base: "starling-todos:" }),
	}),
);

const remoteStorage = unstoragePlugin<Todo>(
	"todos",
	createStorage({
		driver: httpDriver({ base: "http://localhost:3001/api" }),
	}),
	{
		pollIntervalMs: 5000,
		onBeforeSet: (data) => {
			return data.map((doc) =>
				processDocument(doc, (value) => ({
					...value,
					"~value": pseudoEncrypt(value["~value"]),
				})),
			);
		},
		onAfterGet: (data) => {
			return data.map((doc) =>
				processDocument(doc, (value) => ({
					...value,
					"~value": pseudoDecrypt(value["~value"]),
				})),
			);
		},
	},
);

// Create Starling store with local storage and HTTP Sync
export const todoStore = await createStore<Todo>()
	.use(localStorage)
	.use(remoteStorage)
	.use(queryPlugin())
	.init();

export const allTodosQuery = todoStore.query({ where: () => true });
export const activeTodosQuery = todoStore.query({
	where: (todo) => !todo.completed,
});
export const completedTodosQuery = todoStore.query({
	where: (todo) => todo.completed,
});
