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

    it("only marks sections collapsible when they have a title", () => {
        // NavSection renders a title-less section bare, with no way to reopen it.
        for (const section of NAV_SECTIONS) {
            if (section.title !== null) continue;
            expect(section.groups.flatMap((g) => g.items).length).toBeLessThan(
                3
            );
        }
    });

    it("wires the compile-time route check", () => {
        expect(navPathsAreRealRoutes).toBe(true);
    });
});
