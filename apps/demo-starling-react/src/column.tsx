import { useMemo } from "react";
import { Card } from "./card";
import { type Status, type Task, TaskStore } from "./store/task-store";

export interface ColumnProps {
	title: string;
	status: Status;
	searchQuery: string;
}

export const Column = ({ title, status, searchQuery }: ColumnProps) => {
	// Use the query hook from the store context
	const tasks = TaskStore.useQuery({
		where: (task) => task.status === status,
	});

	// Get mutations from the store context
	const { update, del } = TaskStore.useMutations();

	const filteredTasks = useMemo(() => {
		const search = searchQuery.toLowerCase();
		if (!search) return tasks;

		const filtered = new Map<string, Task>();
		for (const [id, task] of tasks.entries()) {
			if (task.title.toLowerCase().includes(search)) {
				filtered.set(id, task);
			}
		}
		return filtered;
	}, [tasks, searchQuery]);

	return (
		<div>
			<h2 className="text-sm font-semibold mb-3 text-slate-100">{title}</h2>
			<div className="flex flex-col gap-3">
				{Array.from(filteredTasks.entries()).map(([id, task]) => (
					<Card
						key={id}
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
				))}
			</div>
		</div>
	);
};
