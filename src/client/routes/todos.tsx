import { Outlet, createFileRoute } from "@tanstack/react-router";
import { searchText } from "@/searchText";

/** Filters live in the URL, in words: `?person=ava&tags=food.venue`. */
export interface TodosSearch {
    /** Tag slugs, joined with dots. */
    tags?: string;
    /** A member's slug. */
    person?: string;
    done?: "show";
}

/** `/todos` is everything; `/todos/<slug>` is one list. */
export const Route = createFileRoute("/todos")({
    validateSearch: (search: Record<string, unknown>): TodosSearch => ({
        tags: searchText(search.tags),
        person: searchText(search.person),
        done: search.done === "show" ? "show" : undefined,
    }),
    component: Outlet,
});
