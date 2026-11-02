import { PRIORITIES, comparePriority, type Priority } from "@shared/priority";
import { slugify } from "@shared/slug";
import type { WishlistItemWithTags } from "../../../server/features/wishlists/wishlistItems.router";
import type { WishlistSummary } from "../../../server/features/wishlists/wishlists.router";

export type { WishlistItemWithTags, WishlistSummary };

/** Priority in wanting terms; to-dos say High and Low. */
export const PRIORITY_LABEL: Record<Priority, string> = {
    high: "Must have",
    normal: "Would like",
    low: "Someday",
};

export const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({
    value,
    label: PRIORITY_LABEL[value],
}));

export interface WishFilter {
    /** Items must carry all of these, matched by slug as the URL holds them. */
    tags?: string[];
    /** A member id. */
    person?: string;
}

export const filterItems = (
    items: WishlistItemWithTags[],
    { tags = [], person }: WishFilter
): WishlistItemWithTags[] =>
    items.filter(
        (item) =>
            (!person || item.wantedById === person) &&
            tags.every((tag) =>
                item.tags.some((own) => slugify(own) === slugify(tag))
            )
    );

export interface WishSplit {
    open: WishlistItemWithTags[];
    bought: WishlistItemWithTags[];
}

/** Most wanted first, then oldest; bought ones most recent first. */
export const splitItems = (items: WishlistItemWithTags[]): WishSplit => ({
    open: items
        .filter((item) => item.boughtAt === null)
        .sort(
            (a, b) =>
                comparePriority(a.priority, b.priority) ||
                a.createdAt.getTime() - b.createdAt.getTime()
        ),
    bought: items
        .filter((item) => item.boughtAt !== null)
        .sort(
            (a, b) =>
                (b.boughtAt?.getTime() ?? 0) - (a.boughtAt?.getTime() ?? 0)
        ),
});

/** Adds up what has a price. Anything without one counts for nothing. */
export const priceTotal = (items: WishlistItemWithTags[]): number =>
    items.reduce((sum, item) => sum + (item.price ?? 0), 0);

export interface WishSection {
    title: string;
    total: number;
    items: WishlistItemWithTags[];
}

/** A section per priority in use. Takes open items already in order. */
export const wishSections = (open: WishlistItemWithTags[]): WishSection[] =>
    PRIORITIES.map((priority) => {
        const items = open.filter((item) => item.priority === priority);

        return {
            title: PRIORITY_LABEL[priority],
            total: priceTotal(items),
            items,
        };
    }).filter((section) => section.items.length > 0);

/** The line under the page title: how much is left, and whether the total can be
 *  trusted. `filtered` is whether a filter is hiding anything. */
export const wishSummary = (
    open: WishlistItemWithTags[],
    boughtCount: number,
    filtered: boolean
): string => {
    if (open.length === 0) {
        if (boughtCount > 0) return "All bought.";

        return filtered
            ? "Nothing matches these filters."
            : "Nothing on here yet.";
    }

    const left = open.length === 1 ? "1 thing" : `${open.length} things`;
    const unpriced = open.filter((item) => item.price === null).length;
    if (unpriced === 0) return `${left} to buy.`;
    if (unpriced === open.length) return `${left} to buy, none priced yet.`;

    return `${left} to buy, ${unpriced} not priced yet.`;
};
