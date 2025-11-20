/**
 * Shared types for query system.
 */

/**
 * A reactive query handle that tracks matching documents and notifies on changes.
 */
export type Query<T> = {
	/** Get current results (computed on-demand) */
	results(): T[];

	/** Register a change listener. Returns unsubscribe function. */
	onChange(callback: () => void): () => void;

	/** Dispose this query and clean up listeners */
	dispose(): void;
};
