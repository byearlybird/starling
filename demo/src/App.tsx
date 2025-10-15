import * as idb from "idb-keyval";
import { useEffect, useState } from "react";
import { createIdbDriver } from "../../lib/drivers/idb-driver";
import { makePersisted } from "../../lib/persisted";
import { createStore, type Store } from "../../lib/store";
import { makeSynchronized } from "../../lib/synchronized";
import "./index.css";
import type { Todo } from "./types";

const todoStore = createStore<Todo>("todos");
const { init: initPersist, dispose: disposePersist } = makePersisted(
	todoStore,
	{
		driver: createIdbDriver(idb),
	},
);
const x = makeSynchronized(todoStore, {
	setup: initPersist,
	push: async (data) => {
		const response = await fetch("/api/todos", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ todos: data }),
		});
		console.log("Pushed todos", { data, response });
	},
	pull: async () => {
		const response = await fetch("/api/todos");
		if (response.ok) {
			const json = await response.json();
			console.log("Pulled todos", json);
			return json.todos;
		}
		return {};
	},
});

await initPersist;

export function App() {
	const todos = useData(todoStore);
	const [newTodo, setNewTodo] = useState("");

	useEffect(() => {
		return () => disposePersist();
	}, []);

	return (
		<div className="space-y-6">
			<h1 className="text-xl font-bold">Todos</h1>
			<div className="flex gap-2">
				<input
					className="px-2 py-1 border border-white/10 rounded placeholder:text-white/50"
					type="text"
					placeholder="What needs to be done?"
					value={newTodo}
					onChange={(e) => setNewTodo(e.target.value)}
				/>
				<button
					className="bg-indigo-900 rounded px-2 py-1 hover:bg-indigo-800 active:scale-105 disabled:opacity-50"
					disabled={!newTodo.trim()}
					onClick={() => {
						todoStore.insert(crypto.randomUUID(), {
							text: newTodo,
							completed: false,
						});
						setNewTodo("");
					}}
				>
					Add
				</button>
			</div>
			<section className="divide-y divide-white/10">
				{Object.entries(todos).map(([id, todo]) => (
					<label key={id} className="flex items-center gap-2 p-2">
						<input
							type="checkbox"
							defaultChecked={todo.completed}
							className="w-4 h-4"
							onChange={(e) =>
								todoStore.update(id, { completed: e.currentTarget.checked })
							}
						/>
						<span className="flex-1">{todo.text}</span>
					</label>
				))}
			</section>
		</div>
	);
}

function useData<TValue extends object>(store: Store<TValue>) {
	const [state, setState] = useState<Record<string, TValue>>(store.values());

	store.onInsert(() => {
		setState(store.values());
	});

	store.onUpdate(() => {
		setState(store.values());
	});

	return state;
}

export default App;
