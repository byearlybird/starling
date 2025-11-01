import { createSignal } from "solid-js";
import { Column } from "./column";
import { SearchInput } from "./search-input";
import {
	doingTasksQuery,
	doneTasksQuery,
	taskSchema,
	taskStore,
	todoTasksQuery,
} from "./store/task-store";

const createTask = (title: string) => {
	const validated = taskSchema.parse({ title });
	return taskStore.add(validated);
};

function App() {
	const [searchQuery, setSearchQuery] = createSignal("");

	const onAdd = () => {
		const title = prompt("New task title");
		if (!title) return;
		createTask(title);
	};

	return (
		<div class="max-w-[1100px] mx-auto my-8">
			<SearchInput
				query={searchQuery()}
				onQueryChange={setSearchQuery}
				onAdd={onAdd}
			/>
			<div class="grid grid-cols-3 gap-6">
				<Column
					title="To Do"
					query={todoTasksQuery}
					searchQuery={searchQuery}
				/>
				<Column
					title="Doing"
					query={doingTasksQuery}
					searchQuery={searchQuery}
				/>
				<Column title="Done" query={doneTasksQuery} searchQuery={searchQuery} />
			</div>
		</div>
	);
}

export default App;
