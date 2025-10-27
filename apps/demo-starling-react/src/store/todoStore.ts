import { Store } from "@byearlybird/starling";
import { createQueryManager } from "@byearlybird/starling-plugins-query";
import { unstoragePlugin } from "@byearlybird/starling-plugins-unstorage";
import { createStorage } from "unstorage";
import httpDriver from "unstorage/drivers/http";
import localStorageDriver from "unstorage/drivers/localstorage";

export type Todo = {
	text: string;
	completed: boolean;
};

// Create query manager for filtering
export const queries = createQueryManager<Todo>();

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
	.use(queries.plugin())
	.init();

// Create reactive queries
export const allTodosQuery = queries.query(() => true);
export const activeTodosQuery = queries.query((todo) => !todo.completed);
export const completedTodosQuery = queries.query((todo) => todo.completed);
