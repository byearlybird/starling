import type { AnyObject } from "../document";
import type { PluginHooks, StoreBase } from "./store";

/**
 * Execute all plugin onInit hooks sequentially.
 * @param hooks - Array of onInit handlers
 * @param store - Store instance to pass to hooks
 */
export async function executeInitHooks<T extends AnyObject>(
	hooks: Array<NonNullable<PluginHooks<T>["onInit"]>>,
	store: StoreBase<T>,
): Promise<void> {
	for (const hook of hooks) {
		await hook(store);
	}
}

/**
 * Execute all plugin onDispose hooks sequentially in reverse order.
 * @param hooks - Array of onDispose handlers
 */
export async function executeDisposeHooks<T extends AnyObject>(
	hooks: Array<NonNullable<PluginHooks<T>["onDispose"]>>,
): Promise<void> {
	for (let i = hooks.length - 1; i >= 0; i--) {
		await hooks[i]?.();
	}
}

/**
 * Emit mutation events to all registered plugin handlers.
 * @param onAddHandlers - Handlers for add events
 * @param onUpdateHandlers - Handlers for update events
 * @param onDeleteHandlers - Handlers for delete events
 * @param addEntries - Documents that were added
 * @param updateEntries - Documents that were updated
 * @param deleteKeys - Document IDs that were deleted
 */
export function emitMutations<T extends AnyObject>(
	onAddHandlers: Array<NonNullable<PluginHooks<T>["onAdd"]>>,
	onUpdateHandlers: Array<NonNullable<PluginHooks<T>["onUpdate"]>>,
	onDeleteHandlers: Array<NonNullable<PluginHooks<T>["onDelete"]>>,
	addEntries: ReadonlyArray<readonly [string, T]>,
	updateEntries: ReadonlyArray<readonly [string, T]>,
	deleteKeys: ReadonlyArray<string>,
): void {
	if (addEntries.length > 0) {
		for (const handler of onAddHandlers) {
			handler(addEntries);
		}
	}
	if (updateEntries.length > 0) {
		for (const handler of onUpdateHandlers) {
			handler(updateEntries);
		}
	}
	if (deleteKeys.length > 0) {
		for (const handler of onDeleteHandlers) {
			handler(deleteKeys);
		}
	}
}
