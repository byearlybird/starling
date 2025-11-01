import { useState } from "react";
import { Column } from "./column";
import { SearchInput } from "./search-input";
import { type Status, TaskStore, taskSchema, taskStore } from "./store/task-store";

const createTask = (title: string) => {
	const validated = taskSchema.parse({ title });
	return taskStore.add(validated);
};

function App() {
	const [searchQuery, setSearchQuery] = useState("");

	const onAdd = () => {
		const title = prompt("New task title");
		if (!title) return;
		createTask(title);
	};

	return (
		<TaskStore.Provider store={taskStore}>
			<div className="max-w-[1100px] mx-auto my-8">
				<SearchInput
					query={searchQuery}
					onQueryChange={setSearchQuery}
					onAdd={onAdd}
				/>
				<div className="grid grid-cols-3 gap-6">
					<Column title="To Do" status="todo" searchQuery={searchQuery} />
					<Column title="Doing" status="doing" searchQuery={searchQuery} />
					<Column title="Done" status="done" searchQuery={searchQuery} />
				</div>
			</div>
		</TaskStore.Provider>
	);
}

export default App;
