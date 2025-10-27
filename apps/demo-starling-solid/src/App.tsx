import { createSignal, For, Show } from "solid-js";
import "./App.css";
import { createQuerySignal } from "./store/createQuerySignal";
import {
	activeTodosQuery,
	allTodosQuery,
	completedTodosQuery,
	todoStore,
} from "./store/todoStore";

function App() {
	const [inputValue, setInputValue] = createSignal("");
	const todos = createQuerySignal(allTodosQuery);
	const activeTodos = createQuerySignal(activeTodosQuery);
	const completedTodos = createQuerySignal(completedTodosQuery);

        const addTodo = (text: string) => {
                const id = crypto.randomUUID();
                todoStore.put({ "~id": id, text, completed: false });
        };

	const toggleTodo = (id: string) => {
		const todo = todoStore.get(id);
		if (todo) {
			todoStore.patch(id, { completed: !todo.completed });
		}
	};

	const deleteTodo = (id: string) => {
		todoStore.del(id);
	};

	const clearCompleted = () => {
		for (const id of completedTodos().keys()) {
			todoStore.del(id);
		}
	};

	const handleAddTodo = (event: Event) => {
		event.preventDefault();
		const value = inputValue().trim();
		if (!value) return;

		addTodo(value);
		setInputValue("");
	};

	return (
		<div class="app">
			<h1>todos</h1>

			<form onSubmit={handleAddTodo} class="todo-form">
				<input
					type="text"
					class="todo-input"
					placeholder="What needs to be done?"
					value={inputValue()}
					onInput={(event) => setInputValue(event.currentTarget.value)}
				/>
			</form>

			<div class="todo-list">
				<For each={Array.from(todos().entries())}>
					{([id, todo]) => (
						<div
							class={`todo-item ${todo.completed ? "completed" : ""}`}
							data-id={id}
						>
							<input
								type="checkbox"
								checked={todo.completed}
								onChange={() => toggleTodo(id)}
								class="todo-checkbox"
							/>
							<span class="todo-text">{todo.text}</span>
							<button
								type="button"
								onClick={() => deleteTodo(id)}
								class="todo-delete"
							>
								X
							</button>
						</div>
					)}
				</For>
			</div>

			<Show when={todos().size > 0}>
				<div class="todo-footer">
					<span class="todo-count">
						{activeTodos().size} {activeTodos().size === 1 ? "item" : "items"}{" "}
						left
					</span>
					<Show when={completedTodos().size > 0}>
						<button
							type="button"
							onClick={clearCompleted}
							class="clear-completed"
						>
							Clear completed
						</button>
					</Show>
				</div>
			</Show>
		</div>
	);
}

export default App;
