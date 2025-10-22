import type { EncodedObject } from "../lib";

export function psuedoEncryptRecord(
	record: { key: string; value: EncodedObject }[],
): { key: string; value: EncodedObject }[] {
	return record.map(({ key, value }) => ({
		key,
		value: pseudoEncryptObject(value),
	}));
}

export function pseudoDecryptRecord(
	record: { key: string; value: EncodedObject }[],
): { key: string; value: EncodedObject }[] {
	return record.map(({ key, value }) => ({
		key,
		value: pseudoDecryptObject(value),
	}));
}

function pseudoEncryptObject(obj: EncodedObject): EncodedObject {
	const encryptedObject: EncodedObject = {};
	for (const [key, encodedValue] of Object.entries(obj)) {
		encryptedObject[key] = {
			...encodedValue,
			__value: pseudoEncrypt(JSON.stringify(encodedValue.__value)),
		};
	}
	return encryptedObject;
}

function pseudoDecryptObject(obj: EncodedObject): EncodedObject {
	const decryptedObject: EncodedObject = {};
	for (const [key, encodedValue] of Object.entries(obj)) {
		const decrypted = pseudoDecrypt(encodedValue.__value as string);
		decryptedObject[key] = {
			...encodedValue,
			__value: JSON.parse(decrypted),
		};
	}
	return decryptedObject;
}

function pseudoEncrypt(data: string): string {
	return btoa(data);
}

function pseudoDecrypt(data: string): string {
	return atob(data);
}
