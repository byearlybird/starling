export interface SearchInputProps {
	query: string;
	onQueryChange: (value: string) => void;
	onAdd: () => void;
}

export const SearchInput = (props: SearchInputProps) => {
	return (
		<div class="flex justify-center gap-3 mb-6">
			<input
				class="w-[520px] px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-600"
				placeholder="Search"
				value={props.query}
				onInput={(e) => props.onQueryChange(e.currentTarget.value)}
			/>
			<button
				type="button"
				class="w-9 h-9 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer transition-colors"
				onClick={props.onAdd}
				title="Add task"
			>
				+
			</button>
		</div>
	);
};
