import type { AnyObject } from "../document";
import type { LifecycleEvents, StoreBase } from "./store";

/**
 * Execute all plugin onInit hooks sequentially.
 * @param hooks - Array of onInit handlers
 * @param collectionKey - Collection identifier
 * @param store - Store instance to pass to hooks
 */
export async function executeInitHooks<T extends AnyObject>(
	hooks: Array<NonNullable<LifecycleEvents<T>["onInit"]>>,
	collectionKey: string,
	store: StoreBase<T>,
): Promise<void> {
	for (const hook of hooks) {
		await hook(collectionKey, store);
	}
}

/**
 * Execute all plugin onDispose hooks sequentially in reverse order.
 * @param hooks - Array of onDispose handlers
 * @param collectionKey - Collection identifier
 */
export async function executeDisposeHooks<T extends AnyObject>(
	hooks: Array<NonNullable<LifecycleEvents<T>["onDispose"]>>,
	collectionKey: string,
): Promise<void> {
	for (let i = hooks.length - 1; i >= 0; i--) {
		await hooks[i]?.(collectionKey);
	}
}
