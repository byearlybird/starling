import * as idb from "idb-keyval";
import { createIdbDriver } from "../../lib/drivers/idb-storage";
import { createRepo } from "../../lib/repo";
import { pseudoDecryptRecord, psuedoEncryptRecord } from "./pseudo-crypto";
import type { Todo } from "./types";

export const createTodoRepo = () =>
	createRepo<Todo>("todos", {
		storage: createIdbDriver(idb),
		sync: {
			interval: 1000 * 5, // 5 seconds for demo purposes
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
		},
	});
