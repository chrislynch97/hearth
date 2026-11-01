import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Filters live in the URL, in words: `?person=ava&tags=food.venue`. */
export interface TodosSearch {
    /** Tag slugs, joined with dots. */
    tags?: string;
    /** A member's slug. */
    person?: string;
    done?: "show";
}

// A value like `2026` arrives as a number, as the router parses search as JSON.
const text = (value: unknown): string | undefined =>
    (typeof value === "string" && value) || typeof value === "number"
        ? String(value)
        : undefined;

/** `/todos` is everything; `/todos/<slug>` is one list. */
export const Route = createFileRoute("/todos")({
    validateSearch: (search: Record<string, unknown>): TodosSearch => ({
        tags: text(search.tags),
        person: text(search.person),
        done: search.done === "show" ? "show" : undefined,
    }),
    component: Outlet,
});
