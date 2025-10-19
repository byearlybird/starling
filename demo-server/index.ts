import { serve } from "bun";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import type { EncodedRecord } from "../lib";
import { mergeRecords } from "../lib";

const storage = createStorage({
	driver: fsDriver({
		base: ".todos",
	}),
});

async function getTodos() {
	const persisted = await storage.get<EncodedRecord>("todos");
	return persisted || {};
}

const server = serve({
	routes: {
		"/api/todos": {
			async GET() {
				const todos = await getTodos();
				const response = Response.json({
					todos,
				});
				// Add CORS headers
				response.headers.set("Access-Control-Allow-Origin", "*");
				response.headers.set(
					"Access-Control-Allow-Methods",
					"GET, PUT, POST, DELETE, OPTIONS",
				);
				response.headers.set("Access-Control-Allow-Headers", "Content-Type");
				return response;
			},
			async PUT(req) {
				const persisted = await getTodos();
				const { todos } = (await req.json()) as { todos: EncodedRecord };
				const [merged, changed] = mergeRecords(persisted, todos);
				if (changed) {
					await storage.set("todos", merged);
				}
				const response = Response.json({ success: true });
				// Add CORS headers
				response.headers.set("Access-Control-Allow-Origin", "*");
				response.headers.set(
					"Access-Control-Allow-Methods",
					"GET, PUT, POST, DELETE, OPTIONS",
				);
				response.headers.set("Access-Control-Allow-Headers", "Content-Type");
				return response;
			},
		},
	},

	development: process.env.NODE_ENV !== "production" && {
		// Enable browser hot reloading in development
		hmr: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
