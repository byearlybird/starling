import "./App.css";
import { useEffect, useState } from "react";
import { useData, useQuery } from "../../lib/react";
import { todoStore, todoSync } from "./todo-store";

await todoStore.init();

function App() {
	const [newTodo, setNewTodo] = useState("");
	const { data: todos } = useData(todoStore);
	const { data: incomplete } = useQuery(
		todoStore,
		(todo) => !todo.completed,
		[],
	);

	useEffect(() => {
		todoSync.start().then(() => {
			todoSync.refresh();
		});
	}, []);

	return (
		<>
			<h1>Todos</h1>
			<div>
				<input
					value={newTodo}
					onChange={(e) => setNewTodo(e.currentTarget.value)}
					placeholder="What needs doing?"
				/>
				<button
					type="button"
					onClick={() => {
						todoStore.put(crypto.randomUUID(), {
							text: newTodo,
							completed: false,
						});
						setNewTodo("");
					}}
				>
					Add
				</button>
			</div>
			<section>
				<h3>Incomplete</h3>
				{Object.entries(incomplete).map(([id, todo]) => (
					<label key={id}>
						<input
							type="checkbox"
							checked={todo.completed}
							onChange={(e) =>
								todoStore.update(id, { completed: e.currentTarget.checked })
							}
						/>
						<span>{todo.text}</span>
					</label>
				))}
			</section>
			<section>
				<h3>All</h3>
				{todos.map(({ key, value }) => (
					<label key={key}>
						<input
							type="checkbox"
							checked={value.completed}
							onChange={(e) =>
								todoStore.update(key, { completed: e.currentTarget.checked })
							}
						/>
						<span>{value.text}</span>
					</label>
				))}
			</section>
		</>
	);
}

export default App;
