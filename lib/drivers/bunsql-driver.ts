import { SQL, sql } from "bun";
import type { Driver } from "../types";

export function createBunSQLiteDriver({
	filename = ":memory:",
	tablename = "__collections",
}): Driver {
	const db = new SQL({
		adapter: "sqlite",
		filename,
	});
	const init = initDb(db, tablename);

	return {
		async get(key: string) {
			await init;
			const result =
				await db`SELECT value FROM ${tablename} WHERE key = ${sql(key)}`;
			return result || null;
		},
		async set(key: string, value: string) {
			await init;
			return db`INSERT INTO ${tablename} (key, value) VALUES (${sql(key)}, ${sql(value)})`;
		},
	};
}

async function initDb(db: SQL, tablename: string) {
	await db`CREATE TABLE IF NOT EXISTS ${tablename} (key TEXT PRIMARY KEY, value TEXT)`;
}
