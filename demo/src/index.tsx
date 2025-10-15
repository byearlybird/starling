import { serve } from "bun";
import { createBunSQLiteDriver } from "../../lib/drivers/bunsql-driver";
import { mergeRecords } from "../../lib/operations";
import type { EncodedObject, EncodedRecord } from "../../lib/types";
import index from "./index.html";

const driver = createBunSQLiteDriver({
	filename: "demo.db",
});

async function getTodos() {
	const persisted = await driver.get("todos");
	return persisted || {};
}

const server = serve({
	routes: {
		// Serve index.html for all unmatched routes.
		"/*": index,

		"/api/todos": {
			async GET() {
				const todos = await getTodos();
				console.log("Serving todos:", todos);
				return Response.json({
					todos,
				});
			},
			async PUT(req) {
				const persisted = await getTodos();
				const { todos } = await req.json();
				const [merged, changed] = mergeRecords(persisted, todos);
				if (changed) {
					await driver.set("todos", merged);
				}
				return Response.json({ success: true });
			},
		},
	},

	development: process.env.NODE_ENV !== "production" && {
		// Enable browser hot reloading in development
		hmr: true,

		// Echo console logs from the browser to the server
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
