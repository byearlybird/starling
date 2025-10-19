import { createStore } from "@byearlybird/starling";
import { createHttpSynchronizer } from "@byearlybird/starling/sync";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import { pseudoDecryptRecord, psuedoEncryptRecord } from "./pseudo-crypto";
import type { Todo } from "./types";

export const todoStore = createStore<Todo>("todos", {
	storage: createStorage({
		driver: localStorageDriver({ base: "todos" }),
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
		await fetch("/api/todos", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ todos: data }),
		});
	},
	pull: async () => {
		console.log("pulling");
		const response = await fetch("/api/todos");
		if (!response.ok) return {};

		const json = await response.json();
		return json.todos;
	},
});
