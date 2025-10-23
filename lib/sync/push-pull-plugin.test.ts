/** biome-ignore-all lint/suspicious/noExplicitAny: <testing purposes> */
import { expect, mock, test } from "bun:test";
import type { Store } from "../core";
import type { ArrayKV } from "../core/types";
import { pushPullPlugin } from "./push-pull-plugin";

test("init calls pull and sets up interval", async () => {
	const mockDataArray = [{ key: "key1", value: { foo: "bar" } as any }];

	const pull = mock(() => Promise.resolve(mockDataArray));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => []),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const plugin = pushPullPlugin({
		pull: pull,
		push: push,
	});

	const handle = plugin(mockStore);
	await handle.init();

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.merge).toHaveBeenCalledWith(mockDataArray);
	expect(mockStore.on).toHaveBeenCalledWith("change", expect.any(Function));

	await handle.dispose();
});

test("push-on-change does NOT push when store state is empty", async () => {
	const mockDataArray: ArrayKV<any> = [];

	const pull = mock(() => Promise.resolve(mockDataArray));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => []),
		on: mock((event, callback) => {
			if (event === "change") {
				// Simulate store change event
				callback(undefined);
			}
			return () => {};
		}),
	} as unknown as Store<any>;

	const plugin = pushPullPlugin({
		pull: pull,
		push: push,
	});

	const handle = plugin(mockStore);
	await handle.init();

	expect(pull).toHaveBeenCalledTimes(1);
	expect(mockStore.merge).toHaveBeenCalledWith(mockDataArray);
	expect(push).not.toHaveBeenCalled();

	await handle.dispose();
});

test("dispose clears the interval", async () => {
	const pull = mock(() => Promise.resolve([] as ArrayKV<any>));
	const push = mock(() => Promise.resolve());

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => []),
		on: mock(() => () => {}),
	} as unknown as Store<any>;

	const plugin = pushPullPlugin({
		pull: pull,
		push: push,
		pullInterval: 100,
	});

	const handle = plugin(mockStore);
	await handle.init();

	// Dispose should clear the interval
	await handle.dispose();

	// Wait a bit to ensure interval doesn't fire
	await Bun.sleep(200);

	// pull should only have been called once during init, not again from interval
	expect(pull).toHaveBeenCalledTimes(1);
});

test("push-on-change pushes non-empty state when store changes", async () => {
	const mockDataArray = [{ key: "key1", value: { foo: "bar" } as any }];

	const pull = mock(() => Promise.resolve(mockDataArray));
	const push = mock(() => Promise.resolve());

	let changeCallback: ((data: any) => Promise<void>) | null = null;

	const mockStore = {
		merge: mock(() => {}),
		snapshot: mock(() => mockDataArray),
		on: mock((event, callback) => {
			if (event === "change") {
				changeCallback = callback;
			}
			return () => {};
		}),
	} as unknown as Store<any>;

	const plugin = pushPullPlugin({
		pull: pull,
		push: push,
	});

	const handle = plugin(mockStore);
	await handle.init();

	expect(pull).toHaveBeenCalledTimes(1);

	// Simulate a store change
	if (changeCallback) {
		await changeCallback(undefined);
	}

	expect(push).toHaveBeenCalledWith(mockDataArray);

	await handle.dispose();
});
