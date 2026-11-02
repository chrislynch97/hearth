import { Outlet, createFileRoute } from "@tanstack/react-router";
import { searchText } from "@/searchText";

/** Filters live in the URL, in words: `?person=ava&tags=baking.cooking`. */
export interface WishlistsSearch {
    /** Tag slugs, joined with dots. */
    tags?: string;
    /** A member's slug. */
    person?: string;
    bought?: "show";
}

/** `/wishlists` is everything; `/wishlists/<slug>` is one list. */
export const Route = createFileRoute("/wishlists")({
    validateSearch: (search: Record<string, unknown>): WishlistsSearch => ({
        tags: searchText(search.tags),
        person: searchText(search.person),
        bought: search.bought === "show" ? "show" : undefined,
    }),
    component: Outlet,
});
