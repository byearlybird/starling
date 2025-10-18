import * as idb from "idb-keyval";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import { createStore } from "../../lib/store";
import { createSynchronizer } from "../../lib/synchronized";
import { pseudoDecryptRecord, psuedoEncryptRecord } from "./pseudo-crypto";
import type { Todo } from "./types";

const storage = createStorage({
	driver: localStorageDriver({ base: "todos" }),
});

export const todoStore = createStore<Todo>(storage, "todos");
export const todoSync = createSynchronizer(todoStore, {
	interval: 1000 * 1, // 1 second for demo purposes
	preprocess: async (event, data) => {
		switch (event) {
			case "push":
				return psuedoEncryptRecord(data);
			case "pull":
				return pseudoDecryptRecord(data);
			default:
				return data;
		}
	},
	send: async (data) => {
		await fetch("/api/todos", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ todos: data }),
		});
	},
	receive: async () => {
		const response = await fetch("/api/todos");
		if (!response.ok) return {};

		const json = await response.json();
		return json.todos;
	},
});
