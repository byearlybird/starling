import { useCallback, useState } from "react";
import "./App.css";
import {
	activeTodosQuery,
	allTodosQuery,
	completedTodosQuery,
	todoStore,
} from "./store/todoStore";
import { useQueryResults } from "./store/useQueryResults";

function App() {
	const [inputValue, setInputValue] = useState("");
	const todos = useQueryResults(allTodosQuery);
	const activeTodos = useQueryResults(activeTodosQuery);
	const completedTodos = useQueryResults(completedTodosQuery);

        const addTodo = useCallback((text: string) => {
                const id = crypto.randomUUID();
                todoStore.put({ "~id": id, text, completed: false });
        }, []);

	const toggleTodo = useCallback((id: string) => {
		const todo = todoStore.get(id);
		if (todo) {
			todoStore.patch(id, { completed: !todo.completed });
		}
	}, []);

	const deleteTodo = useCallback((id: string) => {
		todoStore.del(id);
	}, []);

	const clearCompleted = useCallback(() => {
		for (const id of completedTodos.keys()) {
			todoStore.del(id);
		}
	}, [completedTodos]);

	const handleAddTodo = (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputValue.trim()) return;

		addTodo(inputValue);
		setInputValue("");
	};

	return (
		<div className="app">
			<h1>todos</h1>

			<form onSubmit={handleAddTodo} className="todo-form">
				<input
					type="text"
					className="todo-input"
					placeholder="What needs to be done?"
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
				/>
			</form>

			<div className="todo-list">
				{Array.from(todos.entries()).map(([id, todo]) => (
					<div
						key={id}
						className={`todo-item ${todo.completed ? "completed" : ""}`}
					>
						<input
							type="checkbox"
							checked={todo.completed}
							onChange={() => toggleTodo(id)}
							className="todo-checkbox"
						/>
						<span className="todo-text">{todo.text}</span>
						<button
							type="button"
							onClick={() => deleteTodo(id)}
							className="todo-delete"
						>
							X
						</button>
					</div>
				))}
			</div>

			{todos.size > 0 && (
				<div className="todo-footer">
					<span className="todo-count">
						{activeTodos.size} {activeTodos.size === 1 ? "item" : "items"} left
					</span>
					{completedTodos.size > 0 && (
						<button
							type="button"
							onClick={clearCompleted}
							className="clear-completed"
						>
							Clear completed
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export default App;
