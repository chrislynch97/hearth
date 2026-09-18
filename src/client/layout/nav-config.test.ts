import { describe, it, expect } from "vitest";
import {
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
