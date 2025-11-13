export type {
	Document,
	ResourceObject,
	EncodedRecord,
	EncodedValue,
} from "./crdt";
export {
	encodeResource,
	decodeResource,
	mergeResources,
	deleteResource,
	processResource,
} from "./crdt";
export * from "./store";
