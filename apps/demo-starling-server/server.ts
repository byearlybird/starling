import type { Document } from "@byearlybird/starling";
import { createStore } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

type Todo = {
	text: string;
	completed: boolean;
};

const fileStorage = unstoragePlugin<Todo>(
	createStorage<Document<Todo>>({
		driver: fsDriver({ base: "./tmp" }),
	}),
);

const store = await createStore<Todo>("tasks").use(fileStorage).init();

const server = Bun.serve({
	port: 3001,
	async fetch(req) {
		const url = new URL(req.url);

		// CORS headers for local development
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};

		// Handle preflight requests
		if (req.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		// GET /api/todos - Return complete collection
		if (url.pathname === "/api/tasks" && req.method === "GET") {
			const collection = store.collection();
			return new Response(JSON.stringify(collection), {
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			});
		}

		// PUT /api/todos - Merge incoming collection data
		if (url.pathname === "/api/tasks" && req.method === "PUT") {
			try {
				const incoming = (await req.json()) as Document<Todo>;

				store.merge(incoming);

				return new Response(JSON.stringify({ success: true }), {
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				});
			} catch {
				return new Response(JSON.stringify({ error: "Invalid JSON" }), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				});
			}
		}

		// 404 for all other routes
		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
});

console.log(`🚀 Demo server running at http://localhost:${server.port}`);
