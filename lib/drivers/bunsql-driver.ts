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
				await db`SELECT value FROM ${sql(tablename)} WHERE key = ${key}`;
			return result.at(0)?.value || null;
		},
		async set(key: string, value: string) {
			await init;
			await db`INSERT OR REPLACE INTO ${sql(tablename)} (key, value) VALUES (${key}, ${value})`;
		},
	};
}

async function initDb(db: SQL, tablename: string) {
	await db`CREATE TABLE IF NOT EXISTS ${sql(tablename)} (key TEXT PRIMARY KEY, value TEXT)`;
}
