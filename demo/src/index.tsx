import { serve } from "bun";
import { createStorage } from "unstorage";
import { mergeRecords } from "../../lib/operations";
import type { EncodedObject, EncodedRecord } from "../../lib/types";
import index from "./index.html";

const storage = createStorage();

async function getTodos() {
	const persisted = await storage.get<EncodedRecord>("todos");
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
					await storage.set("todos", merged);
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
