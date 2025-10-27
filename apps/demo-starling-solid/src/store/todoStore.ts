import { Store } from "@byearlybird/starling";
import { createQueryManager } from "@byearlybird/starling-plugins-query";
import { unstoragePlugin } from "@byearlybird/starling-plugins-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

export type Todo = {
	text: string;
	completed: boolean;
};

export const queries = createQueryManager<Todo>();

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

export const allTodosQuery = queries.query(() => true);
export const activeTodosQuery = queries.query((todo) => !todo.completed);
export const completedTodosQuery = queries.query((todo) => todo.completed);
