export function generateNonce() {
	const bytes = 32;
	const array = new Uint8Array(bytes);
	crypto.getRandomValues(array);

	// Convert to base64
	return btoa(String.fromCharCode(...array));
}
