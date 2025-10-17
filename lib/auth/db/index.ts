import { Database as SQLite } from "bun:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import {
	FileMigrationProvider,
	type Generated,
	type Insertable,
	Kysely,
	Migrator,
	type Selectable,
	type Updateable,
} from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";

export async function migrateToLatest(db: Kysely<Database>) {
	const migrator = new Migrator({
		db,
		provider: new FileMigrationProvider({
			fs,
			path,
			// This needs to be an absolute path.
			migrationFolder: path.join(__dirname, "./migrations"),
		}),
	});

	const { error, results } = await migrator.migrateToLatest();

	results?.forEach((it) => {
		if (it.status === "Success") {
			console.log(`migration "${it.migrationName}" was executed successfully`);
		} else if (it.status === "Error") {
			console.error(`failed to execute migration "${it.migrationName}"`);
		}
	});

	if (error) {
		console.error("failed to migrate");
		console.error(error);
		process.exit(1);
	}
}

export interface MailboxesTable {
	id: string;
	public_key: string;
	created_at: Generated<number>;
	updated_at: Generated<number>;
}

export interface ChallengesTable {
	id: string;
	mailbox_id: string;
	nonce: string;
	created_at: Generated<number>;
}

export interface CollectionsTable {
	id: string;
	mailbox_id: string;
	domain: string;
	collection: string;
	content: string;
	created_at: Generated<number>;
	updated_at: Generated<number>;
}

export interface Database {
	__mailboxes: MailboxesTable;
	__challenges: ChallengesTable;
	__collections: CollectionsTable;
}

export type Mailbox = Selectable<MailboxesTable>;
export type NewMailbox = Insertable<MailboxesTable>;
export type MailboxUpdate = Updateable<MailboxesTable>;

export type Challenge = Selectable<ChallengesTable>;
export type NewChallenge = Insertable<ChallengesTable>;
export type ChallengeUpdate = Updateable<ChallengesTable>;

export type Collection = Selectable<CollectionsTable>;
export type NewCollection = Insertable<CollectionsTable>;
export type CollectionUpdate = Updateable<CollectionsTable>;

export function createDatabase(databasePath: string = "db.sqlite") {
	return new Kysely<Database>({
		dialect: new BunSqliteDialect({
			database: new SQLite(databasePath),
		}),
	});
}
