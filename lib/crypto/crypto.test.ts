import { describe, expect, test } from "bun:test";
import { decrypt, encrypt, generateKey } from "./crypto";

describe("crypto utilities", () => {
	describe("generateKey", () => {
		test("should generate a valid CryptoKey", async () => {
			const key = await generateKey();

			expect(key).toBeDefined();
			expect(key.type).toBe("secret");
			expect(key.algorithm.name).toBe("AES-GCM");
			expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
		});

		test("should generate an extractable key", async () => {
			const key = await generateKey();

			expect(key.extractable).toBe(true);
		});

		test("should generate key with correct usages", async () => {
			const key = await generateKey();

			expect(key.usages).toContain("encrypt");
			expect(key.usages).toContain("decrypt");
		});

		test("should generate different keys on each call", async () => {
			const key1 = await generateKey();
			const key2 = await generateKey();

			const exported1 = await crypto.subtle.exportKey("raw", key1);
			const exported2 = await crypto.subtle.exportKey("raw", key2);

			expect(exported1).not.toEqual(exported2);
		});
	});

	describe("encrypt", () => {
		test("should encrypt a string and return base64", async () => {
			const key = await generateKey();
			const plaintext = "Secret message!";

			const encrypted = await encrypt(plaintext, key);

			expect(encrypted).toBeDefined();
			expect(typeof encrypted).toBe("string");
			// Should be valid base64
			expect(() => atob(encrypted)).not.toThrow();
		});

		test("should produce different ciphertext from plaintext", async () => {
			const key = await generateKey();
			const plaintext = "Secret message!";

			const encrypted = await encrypt(plaintext, key);

			expect(encrypted).not.toBe(plaintext);
		});

		test("should produce different ciphertext for same input (due to random IV)", async () => {
			const key = await generateKey();
			const plaintext = "Secret message!";

			const encrypted1 = await encrypt(plaintext, key);
			const encrypted2 = await encrypt(plaintext, key);

			expect(encrypted1).not.toBe(encrypted2);
		});

		test("should encrypt empty string", async () => {
			const key = await generateKey();
			const plaintext = "";

			const encrypted = await encrypt(plaintext, key);

			expect(encrypted).toBeDefined();
			expect(typeof encrypted).toBe("string");
		});

		test("should encrypt text with special characters", async () => {
			const key = await generateKey();
			const plaintext = "Hello! 👋 Special chars: @#$%^&*()";

			const encrypted = await encrypt(plaintext, key);

			expect(encrypted).toBeDefined();
			expect(typeof encrypted).toBe("string");
		});
	});

	describe("decrypt", () => {
		test("should decrypt encrypted data", async () => {
			const key = await generateKey();
			const plaintext = "Secret message!";
			const encrypted = await encrypt(plaintext, key);

			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe(plaintext);
		});

		test("should decrypt empty string", async () => {
			const key = await generateKey();
			const plaintext = "";
			const encrypted = await encrypt(plaintext, key);

			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe(plaintext);
		});

		test("should decrypt text with special characters", async () => {
			const key = await generateKey();
			const plaintext = "Hello! 👋 Special chars: @#$%^&*()";
			const encrypted = await encrypt(plaintext, key);

			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe(plaintext);
		});

		test("should throw error when decrypting with wrong key", async () => {
			const key1 = await generateKey();
			const key2 = await generateKey();
			const plaintext = "Secret message!";
			const encrypted = await encrypt(plaintext, key1);

			await expect(decrypt(encrypted, key2)).rejects.toThrow();
		});

		test("should throw error with invalid base64", async () => {
			const key = await generateKey();
			const invalidEncrypted = "not-valid-base64!!!";

			await expect(decrypt(invalidEncrypted, key)).rejects.toThrow();
		});
	});

	describe("full encryption workflow", () => {
		test("should complete full encrypt-decrypt cycle (Usage example)", async () => {
			// Matches the Usage comment in crypto.ts
			const key = await generateKey();
			const encrypted = await encrypt("Secret message!", key);

			expect(encrypted).toBeDefined();
			expect(typeof encrypted).toBe("string");

			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe("Secret message!");
		});

		test("should handle long text", async () => {
			const key = await generateKey();
			const plaintext = "Lorem ipsum dolor sit amet, ".repeat(100);

			const encrypted = await encrypt(plaintext, key);
			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe(plaintext);
		});

		test("should handle unicode characters", async () => {
			const key = await generateKey();
			const plaintext = "Hello 世界! 🌍 Émoji café ñoño";

			const encrypted = await encrypt(plaintext, key);
			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe(plaintext);
		});

		test("should handle newlines and whitespace", async () => {
			const key = await generateKey();
			const plaintext = "Line 1\nLine 2\r\nLine 3\t\tTabbed";

			const encrypted = await encrypt(plaintext, key);
			const decrypted = await decrypt(encrypted, key);

			expect(decrypted).toBe(plaintext);
		});
	});
});
