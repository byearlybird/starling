export function createNonce() {
	const bytes = 32;
	const array = new Uint8Array(bytes);
	crypto.getRandomValues(array);

	// Convert to base64
	return btoa(String.fromCharCode(...array));
}

export async function signChallenge(nonce: string, privateKey: CryptoKey) {
	// Convert nonce string to bytes
	const encoder = new TextEncoder();
	const data = encoder.encode(nonce);

	// Sign with Ed25519 private key
	const signature = await crypto.subtle.sign("Ed25519", privateKey, data);

	// Convert signature to base64
	return Buffer.from(signature).toString("base64");
}

export async function verifySignature(
	nonce: string,
	signature: string,
	publicKeyBase64: string,
) {
	try {
		// Convert base64 public key to ArrayBuffer
		const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");

		// Import the public key
		const publicKey = await crypto.subtle.importKey(
			"spki",
			publicKeyBytes,
			{
				name: "Ed25519",
			},
			false,
			["verify"],
		);

		// Convert challenge to bytes
		const encoder = new TextEncoder();
		const data = encoder.encode(nonce);

		// Convert signature from base64 to bytes
		const signatureBytes = Buffer.from(signature, "base64");

		// Verify the signature
		const isValid = await crypto.subtle.verify(
			"Ed25519",
			publicKey,
			signatureBytes,
			data,
		);

		return isValid;
	} catch (error) {
		console.error("Signature verification error:", error);
		return false;
	}
}
