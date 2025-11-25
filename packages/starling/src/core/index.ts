/**
 * @byearlybird/starling/core
 * Low-level CRDT primitives for custom sync implementations
 *
 * This export provides:
 * - Hybrid logical clocks (eventstamps)
 * - Document and resource management
 * - Mergeable maps with field-level LWW
 *
 * For the full database API, import from "@byearlybird/starling"
 */

export * from "./clock";
export * from "./document";
export * from "./resource-map";
