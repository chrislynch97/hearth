import { describe, it, expect } from "vitest";
import {
    closesMobileNav,
    NAV_ITEMS,
    NAV_SECTIONS,
    type AppRoutePath,
} from "@/layout/nav-config";
import type { FileRoutesByFullPath } from "@/routeTree.gen";

// Compile-time, not a runtime assertion: every path the nav links to has to be a
// route the generated tree actually knows about. Adding a nav item without its
// `routes/<name>.tsx` file fails `npm run typecheck` here rather than 404ing in
// the browser.
type NavPathsAreRealRoutes = AppRoutePath extends keyof FileRoutesByFullPath
    ? true
    : never;
const navPathsAreRealRoutes: NavPathsAreRealRoutes = true;

describe("nav config", () => {
    it("keeps every path to itself", () => {
        const paths = NAV_ITEMS.map(({ item }) => item.to);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it("gives every section a unique id", () => {
        const ids = NAV_SECTIONS.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("flattens to every item in the tree", () => {
        const inTree = NAV_SECTIONS.flatMap((s) =>
            s.groups.flatMap((g) => g.items)
        );
        expect(NAV_ITEMS).toHaveLength(inTree.length);
    });

    it("says something on every planned page", () => {
        // The blurb is the whole content of a ComingSoon page, so an empty one
        // is a blank screen rather than a subtle formatting bug.
        for (const { item } of NAV_ITEMS) {
            if (item.planned === undefined) continue;
            expect(item.planned.trim().length, item.label).toBeGreaterThan(20);
        }
    });

    it("only lets a single-page section navigate from the rail", () => {
        // A rail item with `to` skips the page list entirely, so it had better
        // not be hiding pages behind itself.
        for (const section of NAV_SECTIONS) {
            if (section.to === undefined) continue;
            const items = section.groups.flatMap((g) => g.items);
            expect(items, section.id).toHaveLength(1);
            expect(items[0]?.to, section.id).toBe(section.to);
        }
    });

    it("declares the section the sidebar falls back to", () => {
        // useSelectedSection asserts Money exists — it's what shows while you're
        // on Overview, which owns no page list of its own.
        const money = NAV_SECTIONS.find((s) => s.id === "money");
        expect(money?.to).toBeUndefined();
        expect(money?.groups.length).toBeGreaterThan(0);
    });

    it("wires the compile-time route check", () => {
        expect(navPathsAreRealRoutes).toBe(true);
    });
});

describe("closesMobileNav", () => {
    // Tapping a rail section on a phone swaps the page list; closing the drawer
    // there means reopening it to pick one of the pages you just asked to see.
    it("stays open when the section changes", () => {
        expect(closesMobileNav("/", "/plan")).toBe(false);
        expect(closesMobileNav("/plan", "/rooms")).toBe(false);
        expect(closesMobileNav("/rooms", "/todos")).toBe(false);
    });

    it("closes when a page inside the same section is picked", () => {
        expect(closesMobileNav("/plan", "/funding")).toBe(true);
        expect(closesMobileNav("/plan", "/plan")).toBe(true);
        expect(closesMobileNav("/rooms", "/quotes")).toBe(true);
    });

    // Overview owns no page list, so there is nothing left to pick.
    it("closes on the way to Overview", () => {
        expect(closesMobileNav("/plan", "/")).toBe(true);
    });

    it("closes for a path outside the nav", () => {
        expect(closesMobileNav("/plan", "/settings")).toBe(true);
    });
});
