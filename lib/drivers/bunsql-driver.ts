import { SQL, sql } from "bun";
import type { Driver, EncodedRecord } from "../types";

export function createBunSQLiteDriver({
	filename = ":memory:",
	tablename = "__collections",
	serialize = JSON.stringify,
	deserialize = JSON.parse,
}: {
	filename?: string;
	tablename?: string;
	serialize?: (data: EncodedRecord) => string;
	deserialize?: (data: string) => EncodedRecord;
} = {}): Driver {
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
			const data = result.at(0)?.value;
			if (data) {
				return deserialize(data);
			} else {
				return null;
			}
		},
		async set(key: string, value: EncodedRecord) {
			await init;
			await db`INSERT OR REPLACE INTO ${sql(tablename)} (key, value) VALUES (${key}, ${serialize(value)})`;
		},
	};
}

async function initDb(db: SQL, tablename: string) {
	await db`CREATE TABLE IF NOT EXISTS ${sql(tablename)} (key TEXT PRIMARY KEY, value TEXT)`;
}
