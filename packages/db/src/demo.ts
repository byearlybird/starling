import z from "zod";
import { createDatabase } from "./db";
import { idbPlugin } from "./plugins/idb";

const entrySchema = z.object({
	id: z.uuid().default(() => crypto.randomUUID()),
	content: z.string().min(1),
	createdAt: z.iso.datetime().default(() => new Date().toISOString()),
});

const commentSchema = z.object({
	id: z.uuid().default(() => crypto.randomUUID()),
	entryId: z.uuid(),
	content: z.string().min(1),
	createdAt: z.iso.datetime().default(() => new Date().toISOString()),
});

type Comment = z.infer<typeof commentSchema>;

const taskSchema = z.object({
	id: z.uuid().default(() => crypto.randomUUID()),
	title: z.string().min(1),
	status: z.enum(["incomplete", "complete", "cancelled"]).default("incomplete"),
	createdAt: z.iso.datetime().default(() => new Date().toISOString()),
});

const db = await createDatabase({
	schema: {
		entries: {
			schema: entrySchema,
			getId: (entry) => entry.id,
		},
		comments: {
			schema: commentSchema,
			getId: (comment) => comment.id,
		},
		tasks: {
			schema: taskSchema,
			getId: (task) => task.id,
		},
	},
})
	.use(idbPlugin({ dbName: "journal" }))
	.init();

const task = db.tasks.add({ title: "To do" });
const entry = db.entries.add({ content: "Some entry" });

db.comments.add({
	entryId: entry.id,
	content: "Interesting",
});

const entriesWithComments = db.begin((tx) => {
	const entries = tx.entries.getAll();
	const comments = new Map<string, Comment[]>();

	for (const comment of tx.comments.getAll()) {
		const current = comments.get(comment.entryId);
		let result = [];
		if (current) {
			current.push(comment);
			result = current;
		} else {
			result = [comment];
		}

		comments.set(comment.entryId, result);
	}

	return entries.map((e) => ({
		...e,
		comments: comments.get(e.id) || [],
	}));
});
