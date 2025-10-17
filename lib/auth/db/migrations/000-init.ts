import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable("__mailboxes")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("public_key", "text", (col) => col.notNull())
		.addColumn("created_at", "integer", (col) =>
			col.notNull().defaultTo(sql`strftime('%s', 'now')`),
		)
		.addColumn("updated_at", "integer", (col) =>
			col.notNull().defaultTo(sql`strftime('%s', 'now')`),
		)
		.execute();

	await db.schema
		.createTable("__challenges")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("mailbox_id", "text", (col) => col.notNull())
		.addColumn("challenge", "text", (col) => col.notNull())
		.addColumn("created_at", "integer", (col) =>
			col.notNull().defaultTo(sql`strftime('%s', 'now')`),
		)
		.addForeignKeyConstraint(
			"fk_challenges_mailbox",
			["mailbox_id"],
			"__mailboxes",
			["id"],
			(cb) => cb.onDelete("cascade"),
		)
		.execute();

	await db.schema
		.createTable("__collections")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("mailbox_id", "text", (col) => col.notNull())
		.addColumn("domain", "text", (col) => col.notNull())
		.addColumn("collection", "text", (col) => col.notNull())
		.addColumn("content", "text", (col) => col.notNull())
		.addColumn("created_at", "integer", (col) =>
			col.notNull().defaultTo(sql`strftime('%s', 'now')`),
		)
		.addColumn("updated_at", "integer", (col) =>
			col.notNull().defaultTo(sql`strftime('%s', 'now')`),
		)
		.addForeignKeyConstraint(
			"fk_collections_mailbox",
			["mailbox_id"],
			"__mailboxes",
			["id"],
			(cb) => cb.onDelete("cascade"),
		)
		.addUniqueConstraint("uq_mailbox_domain_collection", [
			"mailbox_id",
			"domain",
			"collection",
		])
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable("__collections").ifExists().execute();
	await db.schema.dropTable("__challenges").ifExists().execute();
	await db.schema.dropTable("__mailboxes").ifExists().execute();
}
