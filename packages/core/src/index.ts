export type {
	Collection,
	EncodedDocument,
	EncodedRecord,
	EncodedValue,
} from "./crdt";
export { mergeCollections, processDocument } from "./crdt";
export * from "./store";
