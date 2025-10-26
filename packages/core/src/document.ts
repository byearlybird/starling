import * as Record from "./record";

type EncodedDocument = {
	"~id": string;
	"~data": Record.EncodedRecord;
	"~deletedAt": string | null;
};

const encode = <T extends Record<string, unknown>>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument => ({
	"~id": id,
	"~data": Record.encode(obj, eventstamp),
	"~deletedAt": deletedAt,
});

const decode = <T extends Record<string, unknown>>(
	doc: EncodedDocument,
): {
	"~id": string;
	"~data": T;
	"~deletedAt": string | null;
} => ({
	"~id": doc["~id"],
	"~data": Record.decode(doc["~data"]),
	"~deletedAt": doc["~deletedAt"],
});

const merge = (
	into: EncodedDocument,
	from: EncodedDocument,
): EncodedDocument => ({
	"~id": into["~id"],
	"~data": Record.merge(into["~data"], from["~data"]),
	"~deletedAt":
		into["~deletedAt"] && from["~deletedAt"]
			? into["~deletedAt"] > from["~deletedAt"]
				? into["~deletedAt"]
				: from["~deletedAt"]
			: into["~deletedAt"] || from["~deletedAt"] || null,
});

const del = (doc: EncodedDocument, eventstamp: string): EncodedDocument => ({
	...doc,
	"~deletedAt": eventstamp,
});

export type { EncodedDocument };
export { encode, decode, merge, del };
