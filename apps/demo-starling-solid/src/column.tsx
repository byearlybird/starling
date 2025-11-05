import { type Accessor, createMemo, For } from "solid-js";
import { Card } from "./card";
import { type Status, useQuery, useStore } from "./store/task-store";

export interface ColumnProps {
	title: string;
	status: Status;
	searchQuery: Accessor<string>;
}

export const Column = (props: ColumnProps) => {
	const store = useStore();
	const tasks = useQuery({
		where: (task) => task.status === props.status,
	});

	const filteredTasks = createMemo(() => {
		const search = props.searchQuery().toLowerCase();
		if (!search) return tasks();

		return tasks().filter(([, task]) =>
			task.title.toLowerCase().includes(search),
		);
	});

	return (
		<div>
			<h2 class="text-sm font-semibold mb-3 text-slate-100">{props.title}</h2>
			<div class="flex flex-col gap-3">
				<For each={filteredTasks()}>
					{([id, task]) => (
						<Card
							task={task}
							onRemove={() => store.del(id)}
							onMoveLeft={() =>
								store.update(id, {
									status: task.status === "done" ? "doing" : "todo",
								})
							}
							onMoveRight={() =>
								store.update(id, {
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
