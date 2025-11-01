import { type Accessor, createMemo, For } from "solid-js";
import { Card } from "./card";
import { type Status, type Task, TaskStore } from "./store/task-store";

export interface ColumnProps {
	title: string;
	status: Status;
	searchQuery: Accessor<string>;
}

export const Column = (props: ColumnProps) => {
	// Use the query primitive from the store context
	const tasks = TaskStore.useQuery({
		where: (task) => task.status === props.status,
	});

	// Get mutations from the store context
	const { update, del } = TaskStore.useMutations();

	const filteredTasks = createMemo(() => {
		const search = props.searchQuery().toLowerCase();
		if (!search) return tasks();

		const filtered = new Map<string, Task>();
		for (const [id, task] of tasks().entries()) {
			if (task.title.toLowerCase().includes(search)) {
				filtered.set(id, task);
			}
		}
		return filtered;
	});

	return (
		<div>
			<h2 class="text-sm font-semibold mb-3 text-slate-100">{props.title}</h2>
			<div class="flex flex-col gap-3">
				<For each={Array.from(filteredTasks().entries())}>
					{([id, task]) => (
						<Card
							task={task}
							onRemove={() => del(id)}
							onMoveLeft={() =>
								update(id, {
									status: task.status === "done" ? "doing" : "todo",
								})
							}
							onMoveRight={() =>
								update(id, {
									status: task.status === "todo" ? "doing" : "done",
								})
							}
						/>
					)}
				</For>
			</div>
		</div>
	);
};
