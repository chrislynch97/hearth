import { describe, it, expect } from "vitest";
import {
    NAV_ITEMS,
    NAV_SECTIONS,
    opensByDefault,
    owningSection,
    type AppRoutePath,
    type NavSectionConfig,
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

    it("only gives a single-page section a `to`", () => {
        // A section with `to` shows as a plain link, so it had better not be
        // hiding pages behind itself.
        for (const section of NAV_SECTIONS) {
            if (section.to === undefined) continue;
            const items = section.groups.flatMap((g) => g.items);
            expect(items, section.id).toHaveLength(1);
            expect(items[0]?.to, section.id).toBe(section.to);
        }
    });

    it("wires the compile-time route check", () => {
        expect(navPathsAreRealRoutes).toBe(true);
    });
});

describe("owningSection", () => {
    it("finds the section for a page and for a path below it", () => {
        expect(owningSection("/")?.id).toBe("overview");
        expect(owningSection("/plan")?.id).toBe("money");
        expect(owningSection("/gifts/birthdays")?.id).toBe("lists");
    });

    it("finds none for a page outside the nav", () => {
        expect(owningSection("/settings/account")).toBeNull();
    });
});

describe("opensByDefault", () => {
    const sectionOf = (planned: boolean[]): NavSectionConfig => ({
        id: "test",
        title: "Test",
        groups: [
            {
                title: null,
                items: planned.map((soon, i) => ({
                    to: "/plan",
                    label: `Page ${i}`,
                    icon: "plan",
                    planned: soon ? "Planned, with a blurb." : undefined,
                })),
            },
        ],
    });

    it("opens a section that is mostly built", () => {
        expect(opensByDefault(sectionOf([false, false, true]))).toBe(true);
    });

    it("folds a section that is half or more Soon", () => {
        expect(opensByDefault(sectionOf([false, true]))).toBe(false);
        expect(opensByDefault(sectionOf([true, true]))).toBe(false);
    });

    it("opens Money and folds Home and Lists as things stand", () => {
        const byId = (id: string) => NAV_SECTIONS.find((s) => s.id === id)!;
        expect(opensByDefault(byId("money"))).toBe(true);
        expect(opensByDefault(byId("home"))).toBe(false);
        expect(opensByDefault(byId("lists"))).toBe(false);
    });
});
