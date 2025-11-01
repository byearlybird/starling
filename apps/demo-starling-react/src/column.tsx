import type { Query } from "@byearlybird/starling/plugin-query";
import { useMemo } from "react";
import { Card } from "./card";
import type { Task } from "./store/task-store";
import { taskStore } from "./store/task-store";
import { useQueryResults } from "./store/useQueryResults";

export interface ColumnProps {
	title: string;
	query: Query<Task>;
	searchQuery: string;
}

export const Column = ({ title, query, searchQuery }: ColumnProps) => {
	const tasks = useQueryResults(query);

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
				))}
			</div>
		</div>
	);
};
