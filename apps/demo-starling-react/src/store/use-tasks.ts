import { useCallback, useEffect, useMemo, useState } from "react";
import { db, type Status, type Task } from "./task-store";

const sortByRecency = (a: Task, b: Task) =>
	new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const useTasks = (status: Status, searchQuery: string) => {
	const normalizedQuery = useMemo(
		() => searchQuery.trim().toLowerCase(),
		[searchQuery],
	);

	const selectTasks = useCallback(() => {
		return db.tasks.find(
			(task) =>
				task.status === status &&
				(!normalizedQuery ||
					task.title.toLowerCase().includes(normalizedQuery)),
			{
				sort: sortByRecency,
			},
		);
	}, [status, normalizedQuery]);

	const [tasks, setTasks] = useState<Task[]>(selectTasks);

	useEffect(() => {
		setTasks(selectTasks());

		const unsubscribe = db.on("mutation", (mutation) => {
			if (mutation.collection === "tasks") {
				setTasks(selectTasks());
			}
		});

		return () => unsubscribe();
	}, [selectTasks]);

	return tasks;
};
