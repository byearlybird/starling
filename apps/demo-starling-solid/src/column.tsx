import type { Query } from "@byearlybird/starling";
import { type Accessor, createMemo, For } from "solid-js";
import { Card } from "./card";
import { createQuerySignal } from "./store/create-query-signal";
import type { Task } from "./store/task-store";
import { taskStore } from "./store/task-store";

export interface ColumnProps {
	title: string;
	query: Query<Task>;
	searchQuery: Accessor<string>;
}

export const Column = (props: ColumnProps) => {
	const tasks = createQuerySignal<Task>(props.query);

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
							onRemove={() => taskStore.del(id)}
							onMoveLeft={() =>
								taskStore.update(id, {
									status: task.status === "done" ? "doing" : "todo",
								})
							}
							onMoveRight={() =>
								taskStore.update(id, {
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
