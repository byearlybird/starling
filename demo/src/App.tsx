import { useEffect, useRef, useState } from "react";
import { createQuery } from "../../lib/query";
import { type Store } from "../../lib/store";
import "./index.css";
import { todoStore, todoSync } from "./todo-repo";

export function App() {
	const [newTodo, setNewTodo] = useState("");
	const todos = useData(todoStore);
	const { data: incomplete } = useQuery(todoStore, (todo) => !todo.completed);

	useEffect(() => {
		todoSync.refresh();
		return () => {
			todoSync.dispose();
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
				<h3>Incomplete</h3>
				{Object.entries(incomplete).map(([id, todo]) => (
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
			<section className="divide-y divide-white/10">
				<h3>All</h3>
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

		const disposeInsert = store.onInsert(async () => {
			setState(await store.values());
		});

		const disposeUpdate = store.onUpdate(async () => {
			setState(await store.values());
		});

		load();

		return () => {
			disposeInsert();
			disposeUpdate();
		};
	}, []);

	return state;
}

function useQuery<TValue extends object>(
	store: Store<TValue>,
	predicate: (data: TValue) => boolean,
) {
	const [isLoading, setIsLoading] = useState(true);
	const [data, setData] = useState<Record<string, TValue>>({});

	const queryRef = useRef(createQuery(store, predicate));

	useEffect(() => {
		const query = queryRef.current;

		const disposeInit = query.onInit((results) => {
			setData(results);
			setIsLoading(false);
		});

		const disposeUpdate = query.onUpdate((results) => {
			setData(results);
		});

		query.initialize();

		return () => {
			disposeInit();
			disposeUpdate();
			query.dispose();
		};
	}, []);

	return { data, isLoading };
}

export default App;
