import { useEffect, useMemo, useState } from "react";
import { db, type Status, type Task } from "./task-store";

const sortByRecency = (a: Task, b: Task) =>
	new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const useTasks = (status: Status, searchQuery: string) => {
	const normalizedQuery = useMemo(
		() => searchQuery.trim().toLowerCase(),
		[searchQuery],
	);

	const selectTasks = () =>
		db.tasks.find(
			(task) =>
				task.status === status &&
				(!normalizedQuery ||
					task.title.toLowerCase().includes(normalizedQuery)),
			{
				sort: sortByRecency,
			},
		);

	const [tasks, setTasks] = useState<Task[]>(selectTasks);

	useEffect(() => {
		const updateTasks = () => setTasks(selectTasks());

		updateTasks();

		const unsubscribe = db.on("mutation", (mutations) => {
			const hasTaskChanges = mutations.some(
				(mutation) => mutation.collection === "tasks",
			);

			if (hasTaskChanges) {
				updateTasks();
			}
		});

		return () => unsubscribe();
	}, [selectTasks]);

	return tasks;
};
