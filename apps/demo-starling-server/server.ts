import { createStore, type StoreSnapshot } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

type Todo = {
	text: string;
	completed: boolean;
};

const fileStorage = unstoragePlugin<Todo>(
	"todos",
	createStorage<StoreSnapshot>({
		driver: fsDriver({ base: "./tmp" }),
	}),
);

const store = await createStore<Todo>().use(fileStorage).init();

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

		// GET /api/todos - Return complete persisted snapshot
		if (url.pathname === "/api/todos" && req.method === "GET") {
			const snapshot = store.snapshot();
			return new Response(JSON.stringify(snapshot), {
				headers: {
					"Content-Type": "application/json",
					...corsHeaders,
				},
			});
		}

		// PUT /api/todos - Merge incoming snapshot data
		if (url.pathname === "/api/todos" && req.method === "PUT") {
			try {
				const incoming = (await req.json()) as StoreSnapshot;
				const incomingDocs = incoming.docs ?? [];

				// Forward clock to incoming timestamp before merging
				store.forwardClock(incoming.latestEventstamp);

				// Merge incoming documents using store transaction
				store.begin((tx) => {
					for (const doc of incomingDocs) {
						tx.merge(doc);
					}
				});

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
