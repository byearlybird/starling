import { useState } from "react";
import { APITester } from "./APITester";
import "./index.css";

type Todo = {
	text: string;
	completed: boolean;
};

export function App() {
	const [todos, setTodos] = useState<Todo[]>([]);

	const [newTodo, setNewTodo] = useState("");

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
						setTodos([...todos, { text: newTodo, completed: false }]);
						setNewTodo("");
					}}
				>
					Add
				</button>
			</div>
			<section className="divide-y divide-white/10">
				{todos.map((todo, index) => (
					<div key={index} className="flex items-center gap-2 p-2">
						<input type="checkbox" className="w-4 h-4" />
						<span className="flex-1">{todo.text}</span>
					</div>
				))}
			</section>
		</div>
	);
}

export default App;
