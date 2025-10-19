import { Hono } from "hono";
import { cors } from "hono/cors";
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

const app = new Hono();

// Apply CORS middleware to all API routes
app.use("/api/*", cors());

// GET /api/todos
app.get("/api/todos", async (c) => {
	const todos = await getTodos();
	return c.json({ todos });
});

// PUT /api/todos
app.put("/api/todos", async (c) => {
	const persisted = await getTodos();
	const { todos } = (await c.req.json()) as { todos: EncodedRecord };
	const [merged, changed] = mergeRecords(persisted, todos);
	if (changed) {
		await storage.set("todos", merged);
	}
	return c.json({ success: true });
});

const server = Bun.serve({
	fetch: app.fetch,
	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
