import * as Record from "./record";
import * as Value from "./value";

type EncodedDocument = {
	"~id": string;
	"~data": Value.EncodedValue<unknown> | Record.EncodedRecord;
	"~deletedAt": string | null;
};

const encode = <T>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument => ({
	"~id": id,
	"~data": Record.isObject(obj)
		? Record.encode(obj as Record<string, unknown>, eventstamp)
		: Value.encode(obj, eventstamp),
	"~deletedAt": deletedAt,
});

const decode = <T>(
	doc: EncodedDocument,
): {
	"~id": string;
	"~data": T;
	"~deletedAt": string | null;
} => ({
	"~id": doc["~id"],
	"~data": (Value.isEncoded(doc["~data"])
		? Value.decode(doc["~data"] as Value.EncodedValue<T>)
		: Record.decode(doc["~data"] as Record.EncodedRecord)) as T,
	"~deletedAt": doc["~deletedAt"],
});

const merge = (
	into: EncodedDocument,
	from: EncodedDocument,
): EncodedDocument => {
	const intoIsValue = Value.isEncoded(into["~data"]);
	const fromIsValue = Value.isEncoded(from["~data"]);

	// Type mismatch: cannot merge primitive with object
	if (intoIsValue !== fromIsValue) {
		throw new Error("Merge error: Incompatible types");
	}

	const mergedData =
		intoIsValue && fromIsValue
			? Value.merge(
					into["~data"] as Value.EncodedValue<unknown>,
					from["~data"] as Value.EncodedValue<unknown>,
				)
			: Record.merge(
					into["~data"] as Record.EncodedRecord,
					from["~data"] as Record.EncodedRecord,
				);

	const mergedDeletedAt =
		into["~deletedAt"] && from["~deletedAt"]
			? into["~deletedAt"] > from["~deletedAt"]
				? into["~deletedAt"]
				: from["~deletedAt"]
			: into["~deletedAt"] || from["~deletedAt"] || null;

	return {
		"~id": into["~id"],
		"~data": mergedData,
		"~deletedAt": mergedDeletedAt,
	};
};

const del = (doc: EncodedDocument, eventstamp: string): EncodedDocument => ({
	"~id": doc["~id"],
	"~data": doc["~data"],
	"~deletedAt": eventstamp,
});

export type { EncodedDocument };
export { encode, decode, merge, del };
