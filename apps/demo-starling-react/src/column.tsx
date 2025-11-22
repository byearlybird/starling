import { Card } from "./card";
import { db, type Status } from "./store/task-store";
import { useTasks } from "./store/use-tasks";

export interface ColumnProps {
	title: string;
	status: Status;
	searchQuery: string;
}

export const Column = ({ title, status, searchQuery }: ColumnProps) => {
	const tasks = useTasks(status, searchQuery);

	return (
		<div>
			<h2 className="text-sm font-semibold mb-3 text-slate-100">{title}</h2>
			<div className="flex flex-col gap-3">
				{tasks.map((task) => (
					<Card
						key={task.id}
						task={task}
						onRemove={() => db.tasks.remove(task.id)}
						onMoveLeft={() =>
							db.tasks.update(task.id, {
								status: task.status === "done" ? "doing" : "todo",
							})
						}
						onMoveRight={() =>
							db.tasks.update(task.id, {
								status: task.status === "todo" ? "doing" : "done",
							})
						}
					/>
				))}
			</div>
		</div>
	);
};
