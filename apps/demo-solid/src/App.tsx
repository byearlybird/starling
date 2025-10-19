import {
	createResource,
	createSignal,
	For,
	onCleanup,
	onMount,
} from "solid-js";
import "./App.css";
import type { Store } from "@byearlybird/starling";
import { todoStore, todoSync } from "./todo-store";

function App() {
	const [newTodo, setNewTodo] = createSignal("");
	const todos = useData(todoStore);

	onMount(() => {
		todoSync.start();
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
						todoStore.insert(crypto.randomUUID(), {
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
				<For each={Object.entries(todos())}>
					{([id, todo]) => (
						<label>
							<input
								type="checkbox"
								checked={todo.completed}
								onChange={(e) =>
									todoStore.update(id, { completed: e.currentTarget.checked })
								}
							/>
							<span>{todo.text}</span>
						</label>
					)}
				</For>
			</section>
		</>
	);
}

function useData<T extends object>(store: Store<T>) {
	const [data, { refetch }] = createResource(store.values, {
		initialValue: {},
	});

	store.on("mutate", () => {
		refetch();
	});

	return data;
}

export default App;
