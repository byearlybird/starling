import { Store } from "@byearlybird/starling";
import { createQueryManager } from "@byearlybird/starling-plugins-query";
import { unstoragePlugin } from "@byearlybird/starling-plugins-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

export type Todo = {
	text: string;
	completed: boolean;
};

// Create query manager for filtering
export const queries = createQueryManager<Todo>();
// Create the Starling store with unstorage and query plugin
export const todoStore = await Store.create<Todo>()
	.use(
		unstoragePlugin(
			"todos",
			createStorage({
				driver: localStorageDriver({ base: "starling-todos:" }),
			}),
		),
	)
	.use(queries.plugin())
	.init();

// Create reactive queries
export const allTodosQuery = queries.query(() => true);
export const activeTodosQuery = queries.query((todo) => !todo.completed);
export const completedTodosQuery = queries.query((todo) => todo.completed);
