import type { Task } from "./store/task-store";

export interface CardProps {
	task: Task;
	onRemove: () => void;
	onMoveLeft: () => void;
	onMoveRight: () => void;
}

export const Card = ({
	task,
	onRemove,
	onMoveLeft,
	onMoveRight,
}: CardProps) => {
	return (
		<div className="bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-700">
			<div className="font-medium text-slate-100">{task.title}</div>
			<div className="flex items-center mt-2">
				<button
					type="button"
					className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-md px-2 py-1 text-xs cursor-pointer transition-colors"
					onClick={onRemove}
					title="Delete"
				>
					×
				</button>
				<div className="flex-1" />
				<button
					type="button"
					className="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 transition-colors"
					disabled={task.status === "todo"}
					onClick={onMoveLeft}
					title="Move left"
				>
					←
				</button>
				<button
					type="button"
					className="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 transition-colors"
					disabled={task.status === "done"}
					onClick={onMoveRight}
					title="Move right"
				>
					→
				</button>
			</div>
		</div>
	);
};
