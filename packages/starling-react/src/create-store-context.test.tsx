import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { createStoreContext } from "./create-store-context";

type Task = {
	title: string;
	status: "todo" | "doing" | "done";
};

describe("createStoreContext", () => {
	let TaskStore: ReturnType<typeof createStoreContext<Task>>;
	let taskStore: Awaited<ReturnType<typeof createStore<Task>>>;

	beforeEach(async () => {
		taskStore = await createStore<Task>().use(queryPlugin()).init();
		TaskStore = createStoreContext<Task>("TaskStore");
	});

	afterEach(async () => {
		await taskStore.dispose();
	});

	test("Provider makes store available to children", () => {
		function TestComponent() {
			const store = TaskStore.useStore();
			return <div>{store ? "Store available" : "No store"}</div>;
		}

		render(
			<TaskStore.Provider store={taskStore}>
				<TestComponent />
			</TaskStore.Provider>,
		);

		expect(screen.getByText("Store available")).toBeDefined();
	});

	test("useStore throws error when used outside Provider", () => {
		function TestComponent() {
			try {
				TaskStore.useStore();
				return <div>No error</div>;
			} catch (error) {
				return <div>Error: {(error as Error).message}</div>;
			}
		}

		render(<TestComponent />);

		expect(
			screen.getByText(/useStore must be used within a TaskStoreProvider/),
		).toBeDefined();
	});

	test("useQuery returns matching documents", () => {
		function TestComponent() {
			const todos = TaskStore.useQuery({
				where: (task) => task.status === "todo",
			});

			return <div>Count: {todos.size}</div>;
		}

		// Add some tasks
		taskStore.add({ title: "Task 1", status: "todo" });
		taskStore.add({ title: "Task 2", status: "doing" });
		taskStore.add({ title: "Task 3", status: "todo" });

		render(
			<TaskStore.Provider store={taskStore}>
				<TestComponent />
			</TaskStore.Provider>,
		);

		expect(screen.getByText("Count: 2")).toBeDefined();
	});

	test("useQuery updates when store changes", async () => {
		function TestComponent() {
			const todos = TaskStore.useQuery({
				where: (task) => task.status === "todo",
			});
			const { add } = TaskStore.useMutations();

			return (
				<div>
					<div>Count: {todos.size}</div>
					<button
						type="button"
						onClick={() => add({ title: "New task", status: "todo" })}
					>
						Add Task
					</button>
				</div>
			);
		}

		render(
			<TaskStore.Provider store={taskStore}>
				<TestComponent />
			</TaskStore.Provider>,
		);

		expect(screen.getByText("Count: 0")).toBeDefined();

		// Click button to add task
		const button = screen.getByText("Add Task");
		act(() => {
			button.click();
		});

		expect(screen.getByText("Count: 1")).toBeDefined();
	});

	test("useMutations provides working mutation functions", () => {
		function TestComponent() {
			const tasks = TaskStore.useQuery({ where: () => true });
			const { add, update, del } = TaskStore.useMutations();

			return (
				<div>
					<div>Count: {tasks.size}</div>
					<button type="button" onClick={() => add({ title: "Test", status: "todo" })}>
						Add
					</button>
					<button
						type="button"
						onClick={() => {
							const id = Array.from(tasks.keys())[0];
							if (id) update(id, { status: "done" });
						}}
					>
						Update
					</button>
					<button
						type="button"
						onClick={() => {
							const id = Array.from(tasks.keys())[0];
							if (id) del(id);
						}}
					>
						Delete
					</button>
					<div>
						{Array.from(tasks.values()).map((task, i) => (
							<div key={i}>
								{task.title} - {task.status}
							</div>
						))}
					</div>
				</div>
			);
		}

		render(
			<TaskStore.Provider store={taskStore}>
				<TestComponent />
			</TaskStore.Provider>,
		);

		// Add task
		act(() => screen.getByText("Add").click());
		expect(screen.getByText("Test - todo")).toBeDefined();

		// Update task
		act(() => screen.getByText("Update").click());
		expect(screen.getByText("Test - done")).toBeDefined();

		// Delete task
		act(() => screen.getByText("Delete").click());
		expect(screen.getByText("Count: 0")).toBeDefined();
	});

	test("useQuery with select transforms results", () => {
		function TestComponent() {
			const titles = TaskStore.useQuery({
				where: (task) => task.status === "todo",
				select: (task) => task.title,
			});

			return (
				<div>
					{Array.from(titles.values()).map((title, i) => (
						<div key={i}>{title}</div>
					))}
				</div>
			);
		}

		taskStore.add({ title: "First task", status: "todo" });
		taskStore.add({ title: "Second task", status: "todo" });

		render(
			<TaskStore.Provider store={taskStore}>
				<TestComponent />
			</TaskStore.Provider>,
		);

		expect(screen.getByText("First task")).toBeDefined();
		expect(screen.getByText("Second task")).toBeDefined();
	});
});
