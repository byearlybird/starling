import { expect, test } from "bun:test";
import { createMailboxId, isValidMailboxId } from "./mailbox-id";

test("should generate a valid mailbox ID", async () => {
	const id = createMailboxId();
	expect(id).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
});

test("should generate unique mailbox IDs", async () => {
	const ids = new Set<string>();
	for (let i = 0; i < 1000; i++) {
		ids.add(createMailboxId());
	}
	expect(ids.size).toBe(1000);
});

test("should validate correct mailbox IDs", async () => {
	expect(createMailboxId()).toSatisfy(isValidMailboxId);
	expect("apple-banana-1234").toSatisfy(isValidMailboxId);
	expect("zoo-quick-0000").toSatisfy(isValidMailboxId);
});

test("should invalidate incorrect mailbox IDs", async () => {
	expect(isValidMailboxId("")).toBe(false);
	expect(isValidMailboxId("apple-banana")).toBe(false);
	expect(isValidMailboxId("apple-banana-123")).toBe(false);
	expect(isValidMailboxId("apple-banana-12345")).toBe(false);
	expect(isValidMailboxId("apple-banana-12a4")).toBe(false);
	expect(isValidMailboxId("apple-banana-1234-extra")).toBe(false);
	expect(isValidMailboxId("apple-1234-banana")).toBe(false);
	expect(isValidMailboxId("apple--banana-1234")).toBe(false);
	expect(isValidMailboxId("apple-banana-")).toBe(false);
	expect(isValidMailboxId("-banana-1234")).toBe(false);
	expect(isValidMailboxId("apple-banana-12 34")).toBe(false);
	expect(isValidMailboxId("apple-banana-12_34")).toBe(false);
	expect(isValidMailboxId("apple-banana-12-34")).toBe(false);
	expect(isValidMailboxId("apple-banana-1234\n")).toBe(false);
	expect(isValidMailboxId(" apple-banana-1234")).toBe(false);
	expect(isValidMailboxId("apple-banana-1234 ")).toBe(false);
	expect(isValidMailboxId("APPLE-BANANA-1234")).toBe(false);
	expect(isValidMailboxId("Apple-Banana-1234")).toBe(false);
	expect(isValidMailboxId("apple-banana-12a4")).toBe(false);
	expect(isValidMailboxId("apple-banana-!@#$")).toBe(false);
});
