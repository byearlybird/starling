import { expect, mock, test } from "bun:test";
import type { Store } from "./store";
import { makeSynchronized } from "./synchronized";
import type { EncodedRecord } from "./types";

test("init calls pull, mergeState, and push with merged state", async () => {
	const mockData: EncodedRecord = {
		key1: { foo: "bar" } as any,
	};

	const mockState: EncodedRecord = {
		key1: { foo: "bar" } as any,
		key2: { baz: "qux" } as any,
	};

	const pull = mock(() => Promise.resolve(mockData));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		mergeState: mock(() => {}),
		state: mock(() => mockState),
	} as unknown as Store<any>;

	const { init, dispose } = makeSynchronized(mockStore, {
		receive: pull,
		send: push,
	});

	await init;

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.mergeState).toHaveBeenCalledWith(mockData);
	expect(mockStore.state).toHaveBeenCalled();
	expect(push).toHaveBeenCalledWith(mockState);

	dispose();
});

test("push is NOT called when store state is empty", async () => {
	const mockData: EncodedRecord = {};
	const emptyState: EncodedRecord = {};

	const pull = mock(() => Promise.resolve(mockData));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		mergeState: mock(() => {}),
		state: mock(() => emptyState),
	} as unknown as Store<any>;

	const { init, dispose } = makeSynchronized(mockStore, {
		receive: pull,
		send: push,
	});

	await init;

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
	} as unknown as Store<any>;

	const { init, dispose } = makeSynchronized(mockStore, {
		receive: pull,
		send: push,
		interval: 100,
	});

	await init;

	// Dispose should clear the interval
	dispose();

	// Wait a bit to ensure interval doesn't fire
	await Bun.sleep(200);

	// pull should only have been called once during init, not again from interval
	expect(pull).toHaveBeenCalledTimes(1);
});

test("refresh can be called manually", async () => {
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
	} as unknown as Store<any>;

	const { refresh, dispose } = makeSynchronized(mockStore, {
		receive: pull,
		send: push,
	});

	// Call refresh manually
	await refresh();

	expect(pull).toHaveBeenCalled();
	expect(mockStore.mergeState).toHaveBeenCalledWith(mockData);
	expect(push).toHaveBeenCalledWith(mockState);

	dispose();
});
