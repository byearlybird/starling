import type { EncodedObject, EncodedRecord } from "../../lib/types";

export function psuedoEncryptRecord(record: EncodedRecord): EncodedRecord {
	const encryptedRecord: EncodedRecord = {};
	for (const [key, obj] of Object.entries(record)) {
		encryptedRecord[key] = pseudoEncryptObject(obj);
	}
	return encryptedRecord;
}

export function pseudoDecryptRecord(record: EncodedRecord): EncodedRecord {
	const decryptedRecord: EncodedRecord = {};
	for (const [key, obj] of Object.entries(record)) {
		decryptedRecord[key] = pseudoDecryptObject(obj);
	}
	return decryptedRecord;
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
