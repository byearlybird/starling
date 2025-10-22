import { createSignal, For, onCleanup, onMount } from "solid-js";
import "./App.css";
import { useData, useQuery } from "../../lib/solid";
import { todoStore, todoSync } from "./todo-store";

function App() {
	const [newTodo, setNewTodo] = createSignal("");
	const todos = useData(todoStore);
	const incomplete = useQuery(todoStore, (todo) => !todo.completed);

	onMount(() => {
		todoSync.start().then(() => todoSync.refresh());
	});

	onCleanup(() => {
		todoStore.dispose();
		todoSync.dispose();
	});

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
				<For each={incomplete()}>
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
			<section>
				<h3>All</h3>
				<For each={todos()}>
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
