/** A search param as text. A value like `2026` arrives as a number, as the router
 *  parses search as JSON. */
export const searchText = (value: unknown): string | undefined =>
    (typeof value === "string" && value) || typeof value === "number"
        ? String(value)
        : undefined;
