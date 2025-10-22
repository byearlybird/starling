/** biome-ignore-all lint/suspicious/noExplicitAny: <testing purposes> */
import { expect, mock, test } from "bun:test";
import type { Store } from "../core";
import type { ArrayKV } from "../core/types";
import { createHttpSynchronizer } from "./http-sync";

test("start calls pull, mergeState, and sets up interval", async () => {
	const mockDataArray = [{ key: "key1", value: { foo: "bar" } as any }];

	const pull = mock(() => Promise.resolve(mockDataArray));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => []),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { start, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
	});

	await start();

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.merge).toHaveBeenCalledWith(mockDataArray);
	expect(mockStore.on).toHaveBeenCalledWith("change", expect.any(Function));

	dispose();
});

test("refresh does NOT push when store state is empty", async () => {
	const mockDataArray: ArrayKV<any> = [];

	const pull = mock(() => Promise.resolve(mockDataArray));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => []),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { refresh, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
	});

	await refresh();

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.merge).toHaveBeenCalledWith(mockDataArray);
	expect(push).not.toHaveBeenCalled();

	dispose();
});

test("dispose clears the interval", async () => {
	const pull = mock(() => Promise.resolve([] as ArrayKV<any>));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => []),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { start, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
		pullInterval: 100,
	});

	await start();

	// Dispose should clear the interval
	dispose();

	// Wait a bit to ensure interval doesn't fire
	await Bun.sleep(200);

	// pull should only have been called once during start, not again from interval
	expect(pull).toHaveBeenCalledTimes(1);
});

test("refresh can be called manually and pushes non-empty state", async () => {
	const mockDataArray = [{ key: "key1", value: { foo: "bar" } as any }];

	const pull = mock(() => Promise.resolve(mockDataArray));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => mockDataArray),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { refresh, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
	});

	// Call refresh manually
	await refresh();

	expect(pull).toHaveBeenCalled();
	expect(mockStore.merge).toHaveBeenCalledWith(mockDataArray);
	expect(push).toHaveBeenCalledWith(mockDataArray);

	dispose();
});
