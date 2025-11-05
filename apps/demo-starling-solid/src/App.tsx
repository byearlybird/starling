import { createSignal } from "solid-js";
import { Column } from "./column";
import { SearchInput } from "./search-input";
import { StoreProvider, taskSchema, useStore } from "./store/task-store";

function AppContent() {
	const store = useStore();
	const [searchQuery, setSearchQuery] = createSignal("");

	const createTask = (title: string) => {
		const validated = taskSchema.parse({ title });
		return store.add(validated);
	};

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
				<Column title="To Do" status="todo" searchQuery={searchQuery} />
				<Column title="Doing" status="doing" searchQuery={searchQuery} />
				<Column title="Done" status="done" searchQuery={searchQuery} />
			</div>
		</div>
	);
}

function App() {
	return (
		<StoreProvider>
			<AppContent />
		</StoreProvider>
	);
}

export default App;
