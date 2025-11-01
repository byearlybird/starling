import type { Task } from "./store/task-store";

export interface CardProps {
	task: Task;
	onRemove: () => void;
	onMoveLeft: () => void;
	onMoveRight: () => void;
}

export const Card = (props: CardProps) => {
	return (
		<div class="bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-700">
			<div class="font-medium text-slate-100">{props.task.title}</div>
			<div class="flex items-center mt-2">
				<button
					type="button"
					class="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-md px-2 py-1 text-xs cursor-pointer transition-colors"
					onClick={props.onRemove}
					title="Delete"
				>
					×
				</button>
				<div class="flex-1" />
				<button
					type="button"
					class="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 transition-colors"
					disabled={props.task.status === "todo"}
					onClick={props.onMoveLeft}
					title="Move left"
				>
					←
				</button>
				<button
					type="button"
					class="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 transition-colors"
					disabled={props.task.status === "done"}
					onClick={props.onMoveRight}
					title="Move right"
				>
					→
				</button>
			</div>
		</div>
	);
};
