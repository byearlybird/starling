import { monotonicFactory } from "ulid";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import {
	pseudoDecryptRecord,
	psuedoEncryptRecord,
} from "../../demo-utils/pseudo-crypto";
import { createStore } from "../../lib";
import { makePersisted } from "../../lib/persist";
import { createHttpSynchronizer } from "../../lib/sync";
import type { Todo } from "./types";

export const todoStore = createStore<Todo>("todos", {
	eventstampFn: monotonicFactory(),
});

export const persistence = makePersisted(todoStore, {
	storage: createStorage({
		driver: localStorageDriver(undefined),
	}),
});

export const todoSync = createHttpSynchronizer(todoStore, {
	pullInterval: 1000 * 5, // 5 second for demo purposes
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
	push: async (data) => {
		console.log("pushing");
		await fetch("http://localhost:3000/api/todos", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ todos: data }),
		});
	},
	pull: async () => {
		console.log("pulling");
		const response = await fetch("http://localhost:3000/api/todos");
		if (!response.ok) return [];

		const json = await response.json();
		return json.todos;
	},
});
