import { createDatabase } from "./db";
import { taskSchema } from "./test-helpers";

const idbPlugin = {
	handlers: {
		init: async (db) => {},
		dispose: async (db) => {},
	},
};

const db = createDatabase({
	schema: {
		tasks: { schema: taskSchema, getId: (task) => task.id },
	},
	plugins: [idbPlugin, httpPlugin],
});
