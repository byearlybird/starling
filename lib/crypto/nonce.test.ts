import { describe, expect, test } from "bun:test";
import { createNonce, signChallenge, verifySignature } from "./nonce";

describe("nonce utilities", () => {
	describe("createNonce", () => {
		test("should generate a valid nonce", () => {
			const nonce = createNonce();

			expect(nonce).toBeDefined();
			expect(typeof nonce).toBe("string");
		});

		test("should generate base64 encoded string", () => {
			const nonce = createNonce();

			// Should be valid base64
			expect(() => atob(nonce)).not.toThrow();
		});

		test("should generate 32 bytes of data", () => {
			const nonce = createNonce();
			const decoded = atob(nonce);

			// 32 bytes should be the decoded length
			expect(decoded.length).toBe(32);
		});

		test("should generate different nonces on each call", () => {
			const nonce1 = createNonce();
			const nonce2 = createNonce();
			const nonce3 = createNonce();

			expect(nonce1).not.toBe(nonce2);
			expect(nonce2).not.toBe(nonce3);
			expect(nonce1).not.toBe(nonce3);
		});

		test("should generate non-empty string", () => {
			const nonce = createNonce();

			expect(nonce.length).toBeGreaterThan(0);
		});
	});

	describe("signChallenge", () => {
		test("should sign a nonce with Ed25519 private key", async () => {
			// Generate an Ed25519 key pair
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);

			expect(signature).toBeDefined();
			expect(typeof signature).toBe("string");
		});

		test("should return base64 encoded signature", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);

			// Should be valid base64
			expect(() => Buffer.from(signature, "base64")).not.toThrow();
		});

		test("should produce Ed25519 signature of correct length", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);
			const signatureBytes = Buffer.from(signature, "base64");

			// Ed25519 signatures are always 64 bytes
			expect(signatureBytes.length).toBe(64);
		});

		test("should produce different signatures for different nonces", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce1 = createNonce();
			const nonce2 = createNonce();
			const signature1 = await signChallenge(nonce1, keyPair.privateKey);
			const signature2 = await signChallenge(nonce2, keyPair.privateKey);

			expect(signature1).not.toBe(signature2);
		});

		test("should produce same signature for same nonce", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = "test-nonce";
			const signature1 = await signChallenge(nonce, keyPair.privateKey);
			const signature2 = await signChallenge(nonce, keyPair.privateKey);

			expect(signature1).toBe(signature2);
		});

		test("should produce different signatures with different keys", async () => {
			const keyPair1 = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);
			const keyPair2 = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = "test-nonce";
			const signature1 = await signChallenge(nonce, keyPair1.privateKey);
			const signature2 = await signChallenge(nonce, keyPair2.privateKey);

			expect(signature1).not.toBe(signature2);
		});

		test("should handle empty string nonce", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = "";
			const signature = await signChallenge(nonce, keyPair.privateKey);

			expect(signature).toBeDefined();
			expect(typeof signature).toBe("string");
		});

		test("should handle nonce with special characters", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = "Hello! 👋 Special chars: @#$%^&*()";
			const signature = await signChallenge(nonce, keyPair.privateKey);

			expect(signature).toBeDefined();
			expect(typeof signature).toBe("string");
		});
	});

	describe("verifySignature", () => {
		test("should verify a valid signature", async () => {
			// Generate an Ed25519 key pair
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			// Export public key to base64
			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);

			const isValid = await verifySignature(nonce, signature, publicKeyBase64);

			expect(isValid).toBe(true);
		});

		test("should reject signature with wrong nonce", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce1 = createNonce();
			const nonce2 = createNonce();
			const signature = await signChallenge(nonce1, keyPair.privateKey);

			const isValid = await verifySignature(nonce2, signature, publicKeyBase64);

			expect(isValid).toBe(false);
		});

		test("should reject signature with wrong public key", async () => {
			const keyPair1 = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);
			const keyPair2 = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair2.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair1.privateKey);

			const isValid = await verifySignature(nonce, signature, publicKeyBase64);

			expect(isValid).toBe(false);
		});

		test("should reject tampered signature", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);

			// Tamper with the signature
			const tamperedSignature = signature.slice(0, -5) + "XXXXX";

			const isValid = await verifySignature(
				nonce,
				tamperedSignature,
				publicKeyBase64,
			);

			expect(isValid).toBe(false);
		});

		test("should return false for invalid base64 signature", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce = createNonce();
			const invalidSignature = "not-valid-base64!!!";

			const isValid = await verifySignature(
				nonce,
				invalidSignature,
				publicKeyBase64,
			);

			expect(isValid).toBe(false);
		});

		test("should return false for invalid base64 public key", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);
			const invalidPublicKey = "not-valid-base64!!!";

			const isValid = await verifySignature(nonce, signature, invalidPublicKey);

			expect(isValid).toBe(false);
		});

		test("should return false for malformed public key", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const nonce = createNonce();
			const signature = await signChallenge(nonce, keyPair.privateKey);

			// Valid base64 but not a valid SPKI public key
			const malformedPublicKey =
				Buffer.from("invalid key data").toString("base64");

			const isValid = await verifySignature(
				nonce,
				signature,
				malformedPublicKey,
			);

			expect(isValid).toBe(false);
		});

		test("should handle empty string nonce", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce = "";
			const signature = await signChallenge(nonce, keyPair.privateKey);

			const isValid = await verifySignature(nonce, signature, publicKeyBase64);

			expect(isValid).toBe(true);
		});

		test("should handle nonce with special characters", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce = "Hello! 👋 Special chars: @#$%^&*()";
			const signature = await signChallenge(nonce, keyPair.privateKey);

			const isValid = await verifySignature(nonce, signature, publicKeyBase64);

			expect(isValid).toBe(true);
		});
	});

	describe("full signature workflow", () => {
		test("should complete full sign-verify cycle", async () => {
			// Generate key pair
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			// Export public key
			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			// Generate nonce
			const nonce = createNonce();

			// Sign
			const signature = await signChallenge(nonce, keyPair.privateKey);

			// Verify
			const isValid = await verifySignature(nonce, signature, publicKeyBase64);

			expect(isValid).toBe(true);
		});

		test("should verify multiple signatures from same key pair", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			// Sign multiple different nonces
			const nonce1 = createNonce();
			const nonce2 = createNonce();
			const nonce3 = createNonce();

			const signature1 = await signChallenge(nonce1, keyPair.privateKey);
			const signature2 = await signChallenge(nonce2, keyPair.privateKey);
			const signature3 = await signChallenge(nonce3, keyPair.privateKey);

			// Verify all signatures
			const isValid1 = await verifySignature(
				nonce1,
				signature1,
				publicKeyBase64,
			);
			const isValid2 = await verifySignature(
				nonce2,
				signature2,
				publicKeyBase64,
			);
			const isValid3 = await verifySignature(
				nonce3,
				signature3,
				publicKeyBase64,
			);

			expect(isValid1).toBe(true);
			expect(isValid2).toBe(true);
			expect(isValid3).toBe(true);
		});

		test("should not allow signature reuse with different nonces", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const nonce1 = createNonce();
			const nonce2 = createNonce();

			const signature1 = await signChallenge(nonce1, keyPair.privateKey);

			// Try to verify signature1 with nonce2 (should fail)
			const isValid = await verifySignature(
				nonce2,
				signature1,
				publicKeyBase64,
			);

			expect(isValid).toBe(false);
		});

		test("should handle long text nonces", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const longNonce = "Lorem ipsum dolor sit amet, ".repeat(100);
			const signature = await signChallenge(longNonce, keyPair.privateKey);

			const isValid = await verifySignature(
				longNonce,
				signature,
				publicKeyBase64,
			);

			expect(isValid).toBe(true);
		});

		test("should handle unicode nonces", async () => {
			const keyPair = await crypto.subtle.generateKey(
				{ name: "Ed25519" },
				true,
				["sign", "verify"],
			);

			const publicKeyBytes = await crypto.subtle.exportKey(
				"spki",
				keyPair.publicKey,
			);
			const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

			const unicodeNonce = "Hello 世界! 🌍 Émoji café ñoño";
			const signature = await signChallenge(unicodeNonce, keyPair.privateKey);

			const isValid = await verifySignature(
				unicodeNonce,
				signature,
				publicKeyBase64,
			);

			expect(isValid).toBe(true);
		});
	});
});
