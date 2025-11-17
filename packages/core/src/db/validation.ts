import type { StandardSchemaV1 } from "../standard-schema";
import type { InferSchemaOutput } from "./types";

/**
 * Validate a value against a StandardSchema (pure async function).
 *
 * @param schema - StandardSchema-compliant schema
 * @param value - Value to validate
 * @returns Validated value
 * @throws Error if validation fails
 */
export async function validateSchema<TSchema extends StandardSchemaV1>(
	schema: TSchema,
	value: unknown,
): Promise<InferSchemaOutput<TSchema>> {
	const result = await schema["~standard"].validate(value);

	if (result.issues) {
		const messages = result.issues.map((issue) => issue.message).join(", ");
		throw new Error(`Validation failed: ${messages}`);
	}

	return result.value as InferSchemaOutput<TSchema>;
}
