import type { AnyObject } from "../../document";
import type { QueryInternal } from "../../store/types";

/**
 * Apply optional select transformation to a value.
 * @param query - Query configuration with optional select function
 * @param value - Value to transform
 * @returns Transformed value or original value if no select function
 */
export function selectValue<T extends AnyObject, U>(
	query: QueryInternal<T, U>,
	value: T,
): U {
	return query.select ? query.select(value) : (value as unknown as U);
}
