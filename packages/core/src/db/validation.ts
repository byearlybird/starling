import type { AnySchema } from "./types";

/**
 * Validation error thrown when Standard Schema validation fails.
 */
export class ValidationError extends Error {
	constructor(
		message: string,
		public readonly issues: ReadonlyArray<{
			message: string;
			path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
		}>,
	) {
		super(message);
		this.name = "ValidationError";
	}
}

/**
 * Validate data against a Standard Schema.
 * Throws ValidationError if validation fails.
 *
 * @param schema - Standard Schema-compliant validator
 * @param data - Data to validate
 * @returns Validated output
 * @throws ValidationError if validation fails
 */
export async function validate<T>(
	schema: AnySchema,
	data: unknown,
): Promise<T> {
	const result = await schema["~standard"].validate(data);

	if (result.issues) {
		const message = formatValidationError(result.issues);
		throw new ValidationError(message, result.issues);
	}

	return result.value;
}

/**
 * Format validation issues into a human-readable error message.
 */
function formatValidationError(
	issues: ReadonlyArray<{
		message: string;
		path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
	}>,
): string {
	if (issues.length === 0) {
		return "Validation failed";
	}

	if (issues.length === 1) {
		const [issue] = issues;
		if (!issue) {
			return "Validation failed";
		}
		const path = formatPath(issue.path);
		return path ? `${path}: ${issue.message}` : issue.message;
	}

	const formatted = issues
		.map((issue) => {
			const path = formatPath(issue.path);
			return path ? `  - ${path}: ${issue.message}` : `  - ${issue.message}`;
		})
		.join("\n");

	return `Validation failed with ${issues.length} errors:\n${formatted}`;
}

/**
 * Format a path array into a dot-notation string.
 */
function formatPath(
	path: ReadonlyArray<PropertyKey | { key: PropertyKey }> | undefined,
): string | null {
	if (!path || path.length === 0) {
		return null;
	}

	return path
		.map((segment) =>
			typeof segment === "object" && segment !== null
				? String(segment.key)
				: String(segment),
		)
		.join(".");
}
