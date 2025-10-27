import { type Document, Store } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling-plugin-unstorage";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

const fileStorage = unstoragePlugin(
	"todos",
	createStorage({
		driver: fsDriver({ base: "./tmp" }),
	}),
);

const store = Store.create().use(fileStorage);

await store.init();

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

		// GET /api/todos - Return all todos
		if (url.pathname === "/api/todos" && req.method === "GET") {
			const todos = store.snapshot();
			return new Response(JSON.stringify(todos), {
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			});
		}

		// PUT /api/todos - Merge incoming todos
		if (url.pathname === "/api/todos" && req.method === "PUT") {
			try {
				const incomingDocs: Document.EncodedDocument[] = await req.json();

				// Merge incoming documents using store transaction
				const tx = store.begin();
				for (const doc of incomingDocs) {
					tx.merge(doc);
				}
				tx.commit();

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
