import { createSignal, For } from "solid-js";
import "./App.css";
import { useData, useQuery } from "../../lib/solid";
import { todoStore } from "./todo-store";

function App() {
	const [newTodo, setNewTodo] = createSignal("");
	const todos = useData(todoStore);
	const incomplete = useQuery(todoStore, (todo) => !todo.completed);

	return (
		<>
			<h1>Todos</h1>
			<div>
				<input
					value={newTodo()}
					onchange={(e) => setNewTodo(e.currentTarget.value)}
					placeholder="What needs doing?"
				/>
				<button
					type="button"
					onclick={() => {
						todoStore.put(crypto.randomUUID(), {
							text: newTodo(),
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
				<For each={Array.from(incomplete())}>
					{([key, todo]) => (
						<label>
							<input
								type="checkbox"
								checked={todo.completed}
								onChange={(e) =>
									todoStore.update(key, { completed: e.currentTarget.checked })
								}
							/>
							<span>{todo.text}</span>
						</label>
					)}
				</For>
			</section>
			<section>
				<h3>All</h3>
				<For each={Array.from(todos())}>
					{({ key, value }) => (
						<label>
							<input
								type="checkbox"
								checked={value.completed}
								onChange={(e) =>
									todoStore.update(key, { completed: e.currentTarget.checked })
								}
							/>
							<span>{value.text}</span>
						</label>
					)}
				</For>
			</section>
		</>
	);
}

export default App;
