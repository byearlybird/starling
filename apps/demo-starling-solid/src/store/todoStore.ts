import { Store } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling-plugin-query";
import { unstoragePlugin } from "@byearlybird/starling-plugin-unstorage";
import { createStorage } from "unstorage";
import httpDriver from "unstorage/drivers/http";
import localStorageDriver from "unstorage/drivers/localstorage";

export type Todo = {
	text: string;
	completed: boolean;
};

const localStorage = unstoragePlugin(
	"todos",
	createStorage({
		driver: localStorageDriver({ base: "starling-todos:" }),
	}),
);

const remoteStorage = unstoragePlugin(
	"todos",
	createStorage({
		driver: httpDriver({ base: "http://localhost:3001/api" }),
	}),
	{ pollIntervalMs: 5000 },
);

// Create Starling store with local storage and HTTP Sync
export const todoStore = await Store.create<Todo>()
	.use(localStorage)
	.use(remoteStorage)
	.use(queryPlugin())
	.init();

export const allTodosQuery = todoStore.query(() => true);
export const activeTodosQuery = todoStore.query((todo) => !todo.completed);
export const completedTodosQuery = todoStore.query((todo) => todo.completed);
