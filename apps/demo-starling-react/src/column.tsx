import { useMemo } from "react";
import { Card } from "./card";
import { type Status, useQuery, useStore } from "./store/task-store";

export interface ColumnProps {
	title: string;
	status: Status;
	searchQuery: string;
}

export const Column = ({ title, status, searchQuery }: ColumnProps) => {
	const taskStore = useStore();
	const tasks = useQuery({
		where: (task) => task.status === status,
	});

	const filteredTasks = useMemo(() => {
		const search = searchQuery.toLowerCase();
		if (!search) return tasks;

		return tasks.filter(([, task]) =>
			task.title.toLowerCase().includes(search),
		);
	}, [tasks, searchQuery]);

	return (
		<div>
			<h2 className="text-sm font-semibold mb-3 text-slate-100">{title}</h2>
			<div className="flex flex-col gap-3">
				{filteredTasks.map(([id, task]) => (
					<Card
						key={id}
						task={task}
						onRemove={() => taskStore.remove(id)}
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
