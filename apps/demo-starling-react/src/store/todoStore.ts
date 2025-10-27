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

// Create the Starling store with local storage and HTTP sync
export const todoStore = await Store.create<Todo>()
	.use(
		unstoragePlugin(
			"todos",
			createStorage({
				driver: localStorageDriver({ base: "starling-todos:" }),
			}),
		),
	)
	.use(
		unstoragePlugin(
			"todos",
			createStorage({
				driver: httpDriver({ base: "http://localhost:3001/api" }),
			}),
			{ pollIntervalMs: 5000 },
		),
	)
	.use(queryPlugin())
	.init();

// Create reactive queries
export const allTodosQuery = todoStore.query(() => true);
export const activeTodosQuery = todoStore.query((todo) => !todo.completed);
export const completedTodosQuery = todoStore.query((todo) => todo.completed);
