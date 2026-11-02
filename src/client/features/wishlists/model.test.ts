import { describe, expect, it } from "vitest";
import {
    filterItems,
    priceTotal,
    splitItems,
    wishSections,
    wishSummary,
    type WishlistItemWithTags,
} from "./model";

const item = (
    fields: Partial<WishlistItemWithTags> = {}
): WishlistItemWithTags => ({
    id: "i",
    householdId: "h",
    listId: null,
    name: "Thing",
    link: null,
    price: null,
    priority: "normal",
    wantedById: null,
    notes: null,
    boughtAt: null,
    boughtById: null,
    archivedAt: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    tags: [],
    ...fields,
});

describe("filterItems", () => {
    const rug = item({ id: "rug", wantedById: "ava", tags: ["Home", "Big"] });
    const mug = item({ id: "mug", wantedById: "ben", tags: ["Home"] });

    it("matches a tag however it is spelt", () => {
        expect(filterItems([rug, mug], { tags: ["big"] })).toEqual([rug]);
    });

    it("needs every tag and the person", () => {
        expect(
            filterItems([rug, mug], { tags: ["Home", "Big"] }).map((i) => i.id)
        ).toEqual(["rug"]);
        expect(filterItems([rug, mug], { person: "ben" })).toEqual([mug]);
        expect(filterItems([rug, mug], {})).toHaveLength(2);
    });
});

describe("splitItems", () => {
    it("puts the most wanted first, oldest first within a priority", () => {
        const { open } = splitItems([
            item({ id: "someday", priority: "low" }),
            item({ id: "newer", createdAt: new Date(2026, 1, 1) }),
            item({ id: "older" }),
            item({ id: "must", priority: "high" }),
        ]);

        expect(open.map((i) => i.id)).toEqual([
            "must",
            "older",
            "newer",
            "someday",
        ]);
    });

    it("keeps bought items apart, latest first", () => {
        const { open, bought } = splitItems([
            item({ id: "first", boughtAt: new Date(2026, 0, 2) }),
            item({ id: "second", boughtAt: new Date(2026, 0, 3) }),
            item({ id: "still" }),
        ]);

        expect(open.map((i) => i.id)).toEqual(["still"]);
        expect(bought.map((i) => i.id)).toEqual(["second", "first"]);
    });
});

describe("priceTotal", () => {
    it("adds minor units and skips anything unpriced", () => {
        expect(
            priceTotal([item({ price: 1250 }), item(), item({ price: 50 })])
        ).toBe(1300);
    });
});

describe("wishSections", () => {
    it("names a section per priority in use, each with its total", () => {
        const sections = wishSections([
            item({ priority: "high", price: 100 }),
            item({ priority: "low", price: 5 }),
            item({ priority: "low" }),
        ]);

        expect(sections.map(({ title, total }) => [title, total])).toEqual([
            ["Must have", 100],
            ["Someday", 5],
        ]);
    });
});

describe("wishSummary", () => {
    it("says when there is nothing left", () => {
        expect(wishSummary([], 2, false)).toBe("All bought.");
        expect(wishSummary([], 0, false)).toBe("Nothing on here yet.");
        expect(wishSummary([], 0, true)).toBe(
            "Nothing matches these filters."
        );
    });

    it("counts what is left and owns up to missing prices", () => {
        expect(wishSummary([item({ price: 1 })], 0, false)).toBe(
            "1 thing to buy."
        );
        expect(wishSummary([item({ price: 1 }), item()], 0, false)).toBe(
            "2 things to buy, 1 not priced yet."
        );
        expect(wishSummary([item()], 0, false)).toBe(
            "1 thing to buy, none priced yet."
        );
    });
});
