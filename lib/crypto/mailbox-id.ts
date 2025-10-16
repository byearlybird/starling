import * as bip39 from "bip39";

function getRandomWord() {
	const wordlist = bip39.wordlists.english!;
	const index = crypto.getRandomValues(new Uint32Array(1))[0]! % 2048;
	return wordlist[index];
}

function getRandomNumber() {
	const number = crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;
	return number.toString().padStart(4, "0");
}

export function generateMailboxId() {
	const word1 = getRandomWord();
	const word2 = getRandomWord();
	const number = getRandomNumber();
	return `${word1}-${word2}-${number}`;
}

export function isValidMailboxId(mailboxId: string) {
	const wordlistSet = new Set(bip39.wordlists.english || []);

	if (typeof mailboxId !== "string") {
		return false;
	}

	const parts = mailboxId.split("-") as [string, string, string];

	if (parts.length !== 3) {
		return false;
	}

	const [word1, word2, number] = parts;

	if (!wordlistSet.has(word1) || !wordlistSet.has(word2)) {
		return false;
	}

	if (!/^\d{4}$/.test(number)) {
		return false;
	}

	return true;
}
