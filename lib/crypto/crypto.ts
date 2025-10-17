export async function generateKey(): Promise<CryptoKey> {
	return await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		true,
		["encrypt", "decrypt"],
	);
}

export async function encrypt(data: string, key: CryptoKey): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encodedData = new TextEncoder().encode(data);

	const encryptedData = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv },
		key,
		encodedData,
	);

	// Combine IV and encrypted data for easy storage
	const combined = new Uint8Array(iv.length + encryptedData.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encryptedData), iv.length);

	return btoa(String.fromCharCode(...combined));
}

export async function decrypt(
	encryptedBase64: string,
	key: CryptoKey,
): Promise<string> {
	const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
		c.charCodeAt(0),
	);

	const iv = combined.slice(0, 12);
	const encryptedData = combined.slice(12);

	const decryptedData = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv },
		key,
		encryptedData,
	);

	return new TextDecoder().decode(decryptedData);
}

export async function isValidPublicKey(
	publicKeyBase64: string,
): Promise<boolean> {
	try {
		// Decode base64
		const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");

		// Try to import the key
		await crypto.subtle.importKey(
			"spki",
			publicKeyBytes,
			{ name: "Ed25519" },
			false,
			["verify"],
		);

		// If we got here, the key is valid
		return true;
	} catch (error) {
		// Import failed, key is invalid
		return false;
	}
}
