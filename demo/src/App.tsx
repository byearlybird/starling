import { useEffect, useState } from "react";
import { type Store } from "../../lib/store";
import "./index.css";
import { createTodoRepo } from "./todo-repo";

const { store: todoStore, initPromise, dispose } = createTodoRepo();

await initPromise;

export function App() {
	const todos = useData(todoStore);
	const [newTodo, setNewTodo] = useState("");

	useEffect(() => {
		return () => {
			dispose();
		};
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
							checked={todo.completed}
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
	const [state, setState] = useState<Record<string, TValue>>({});

	useEffect(() => {
		const load = async () => {
			const values = await store.values();
			setState(values);
		};

		load();
	}, []);

	store.onInsert(async () => {
		setState(await store.values());
	});

	store.onUpdate(async () => {
		setState(await store.values());
	});

	return state;
}

export default App;
