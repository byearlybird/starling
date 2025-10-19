/** biome-ignore-all lint/suspicious/noExplicitAny: <testing purposes> */
import { expect, mock, test } from "bun:test";
import type { Store } from "../core/store";
import type { EncodedRecord } from "../core/types";
import { createHttpSynchronizer } from "./http-sync";

test("start calls pull, mergeState, and sets up interval", async () => {
	const mockData: EncodedRecord = {
		key1: { foo: "bar" } as any,
	};

	const mockState: EncodedRecord = {};

	const pull = mock(() => Promise.resolve(mockData));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		mergeState: mock(() => {}),
		state: mock(() => mockState),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { start, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
	});

	await start();

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.mergeState).toHaveBeenCalledWith(mockData);
	expect(mockStore.on).toHaveBeenCalledWith("mutate", expect.any(Function));

	dispose();
});

test("refresh does NOT push when store state is empty", async () => {
	const mockData: EncodedRecord = {};
	const emptyState: EncodedRecord = {};

	const pull = mock(() => Promise.resolve(mockData));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		mergeState: mock(() => {}),
		state: mock(() => emptyState),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { refresh, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
	});

	await refresh();

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.mergeState).toHaveBeenCalledWith(mockData);
	expect(push).not.toHaveBeenCalled();

	dispose();
});

test("dispose clears the interval", async () => {
	const pull = mock(() => Promise.resolve({}));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		mergeState: mock(() => {}),
		state: mock(() => ({})),
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
	const mockData: EncodedRecord = {
		key1: { foo: "bar" } as any,
	};

	const mockState: EncodedRecord = {
		key1: { foo: "bar" } as any,
	};

	const pull = mock(() => Promise.resolve(mockData));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		mergeState: mock(() => {}),
		state: mock(() => mockState),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const { refresh, dispose } = createHttpSynchronizer(mockStore, {
		pull: pull,
		push: push,
	});

	// Call refresh manually
	await refresh();

	expect(pull).toHaveBeenCalled();
	expect(mockStore.mergeState).toHaveBeenCalledWith(mockData);
	expect(push).toHaveBeenCalledWith(mockState);

	dispose();
});
