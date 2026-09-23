import { describe, it, expect } from "vitest";
import {
    ALL,
    buildPlan,
    countBills,
    countSetAsides,
    filterByOwner,
    groupKey,
    groupSlugs,
    slugify,
    totalPerPeriod,
    UNCATEGORISED,
} from "./model";
import type {
    Category,
    Expense,
    Pot,
    SetAside,
} from "../../../server/db/schema";

const now = new Date("2026-09-20");

const category = (id: string, name: string): Category => ({
    id,
    householdId: "household",
    name,
    sortOrder: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
});

const pot = (over: Partial<Pot> & Pick<Pot, "id" | "name">): Pot => ({
    householdId: "household",
    categoryId: null,
    ownerId: "joint",
    sortOrder: 0,
    note: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
});

const bill = (
    over: Partial<Expense> & Pick<Expense, "id" | "name">
): Expense => ({
    householdId: "household",
    recurrence: "monthly",
    amount: 1000,
    funding: "pot_manual",
    potId: null,
    categoryId: null,
    note: null,
    active: 1,
    includeInEmergencyFund: 1,
    dueAnchor: null,
    dueReminderDays: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
});

const setAside = (
    over: Partial<SetAside> & Pick<SetAside, "id" | "name" | "potId">
): SetAside => ({
    householdId: "household",
    groupLabel: null,
    ownerId: "joint",
    amount: 1000,
    recurrence: "monthly",
    note: null,
    active: 1,
    includeInEmergencyFund: 1,
    sortOrder: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
});

const build = (over: {
    categories?: Category[];
    pots?: Pot[];
    bills?: Expense[];
    setAsides?: SetAside[];
}) =>
    buildPlan({
        categories: over.categories ?? [],
        pots: over.pots ?? [],
        bills: over.bills ?? [],
        setAsides: over.setAsides ?? [],
        members: [],
        frequency: "monthly",
    });

describe("buildPlan", () => {
    it("hangs a pot's bills and set-asides off the pot, under its category", () => {
        const [group] = build({
            categories: [category("c1", "Housing")],
            pots: [pot({ id: "p1", name: "Rent", categoryId: "c1" })],
            bills: [
                bill({ id: "b1", name: "Rent", potId: "p1", amount: 95000 }),
            ],
            setAsides: [
                setAside({
                    id: "s1",
                    name: "Buffer",
                    potId: "p1",
                    amount: 3000,
                }),
            ],
        });

        expect(group?.name).toBe("Housing");
        expect(group?.pots).toHaveLength(1);
        expect(group?.pots[0]?.bills.map((b) => b.id)).toEqual(["b1"]);
        expect(group?.pots[0]?.setAsides.map((s) => s.id)).toEqual(["s1"]);
    });

    // The whole point of the page: a pot's requirement is what drains it plus
    // what fills it, which is how the funding plan derives its standing order.
    it("adds bills and set-asides together for the pot's per-period figure", () => {
        const [group] = build({
            categories: [category("c1", "Housing")],
            pots: [pot({ id: "p1", name: "Rent", categoryId: "c1" })],
            bills: [
                bill({ id: "b1", name: "Rent", potId: "p1", amount: 95000 }),
            ],
            setAsides: [
                setAside({
                    id: "s1",
                    name: "Buffer",
                    potId: "p1",
                    amount: 3000,
                }),
            ],
        });

        expect(group?.pots[0]?.perPeriod).toBe(98000);
        expect(group?.perPeriod).toBe(98000);
    });

    it("normalises a non-monthly recurrence onto the budget period", () => {
        const [group] = build({
            categories: [category("c1", "Housing")],
            pots: [pot({ id: "p1", name: "Water", categoryId: "c1" })],
            bills: [
                bill({
                    id: "b1",
                    name: "Water",
                    potId: "p1",
                    amount: 12000,
                    recurrence: "quarterly",
                }),
            ],
        });

        expect(group?.pots[0]?.perPeriod).toBe(4000);
    });

    // A main-account bill has a category but no pot, so it can't sit in a pot
    // card — and it still has to be funded, so it can't be dropped either.
    it("puts a main-account bill on its category rather than a pot", () => {
        const [group] = build({
            categories: [category("c1", "Subscriptions")],
            bills: [
                bill({
                    id: "b1",
                    name: "Spotify",
                    funding: "main",
                    categoryId: "c1",
                    amount: 1200,
                }),
            ],
        });

        expect(group?.pots).toHaveLength(0);
        expect(group?.mainBills.map((b) => b.id)).toEqual(["b1"]);
        expect(group?.perPeriod).toBe(1200);
    });

    // Legacy rows predate the funding column and have no pot; they are
    // main-account bills whatever the column says.
    it("treats a bill with no pot as a main-account bill", () => {
        const [group] = build({
            categories: [category("c1", "Subscriptions")],
            bills: [
                bill({
                    id: "b1",
                    name: "Old row",
                    funding: "pot_manual",
                    potId: null,
                    categoryId: "c1",
                }),
            ],
        });

        expect(group?.mainBills.map((b) => b.id)).toEqual(["b1"]);
    });

    // Archiving a pot doesn't touch its bills; without a card to sit in they'd
    // be unreachable, still active and no longer funded.
    it("treats a bill on an archived pot as a main-account bill", () => {
        const groups = build({
            pots: [pot({ id: "p1", name: "Gone", archivedAt: now })],
            bills: [bill({ id: "b1", name: "Left behind", potId: "p1" })],
        });

        expect(groups).toHaveLength(1);
        expect(groupKey(groups[0]!)).toBe(UNCATEGORISED);
        expect(groups[0]?.pots).toHaveLength(0);
        expect(groups[0]?.mainBills.map((b) => b.id)).toEqual(["b1"]);
    });

    it("keeps an empty category, so there is somewhere to add into", () => {
        const groups = build({ categories: [category("c1", "Housing")] });

        expect(groups).toHaveLength(1);
        expect(groups[0]?.perPeriod).toBe(0);
    });

    it("collects pots and bills with no category into one bucket, last", () => {
        const groups = build({
            categories: [category("c1", "Housing")],
            pots: [pot({ id: "p1", name: "Stray", categoryId: null })],
            bills: [bill({ id: "b1", name: "Stray bill", funding: "main" })],
        });

        expect(groups).toHaveLength(2);
        expect(groupKey(groups[1]!)).toBe(UNCATEGORISED);
        expect(groups[1]?.name).toBe("Uncategorised");
        expect(groups[1]?.pots.map((p) => p.pot.id)).toEqual(["p1"]);
        expect(groups[1]?.mainBills.map((b) => b.id)).toEqual(["b1"]);
    });

    // Archiving a category doesn't rewrite the pots pointing at it, so they'd
    // otherwise vanish off a page that is meant to show everything.
    it("treats a pot pointing at a missing category as uncategorised", () => {
        const groups = build({
            pots: [pot({ id: "p1", name: "Orphan", categoryId: "gone" })],
        });

        expect(groups).toHaveLength(1);
        expect(groupKey(groups[0]!)).toBe(UNCATEGORISED);
    });

    it("leaves archived and inactive rows out", () => {
        const [group] = build({
            categories: [category("c1", "Housing")],
            pots: [
                pot({ id: "p1", name: "Live", categoryId: "c1" }),
                pot({
                    id: "p2",
                    name: "Gone",
                    categoryId: "c1",
                    archivedAt: now,
                }),
            ],
            bills: [
                bill({ id: "b1", name: "Off", potId: "p1", active: 0 }),
                bill({
                    id: "b2",
                    name: "Archived",
                    potId: "p1",
                    archivedAt: now,
                }),
            ],
            setAsides: [
                setAside({ id: "s1", name: "Off", potId: "p1", active: 0 }),
            ],
        });

        expect(group?.pots.map((p) => p.pot.id)).toEqual(["p1"]);
        expect(group?.pots[0]?.bills).toHaveLength(0);
        expect(group?.pots[0]?.setAsides).toHaveLength(0);
    });

    it("counts what a category holds", () => {
        const [group] = build({
            categories: [category("c1", "Housing")],
            pots: [pot({ id: "p1", name: "Rent", categoryId: "c1" })],
            bills: [
                bill({ id: "b1", name: "Rent", potId: "p1" }),
                bill({
                    id: "b2",
                    name: "Main one",
                    funding: "main",
                    categoryId: "c1",
                }),
            ],
            setAsides: [setAside({ id: "s1", name: "Buffer", potId: "p1" })],
        });

        expect(countBills(group!)).toBe(2);
        expect(countSetAsides(group!)).toBe(1);
    });
});

describe("filterByOwner", () => {
    const groups = () =>
        build({
            categories: [category("c1", "Housing")],
            pots: [
                pot({
                    id: "p1",
                    name: "Ava's",
                    categoryId: "c1",
                    ownerId: "ava",
                }),
                pot({
                    id: "p2",
                    name: "Ben's",
                    categoryId: "c1",
                    ownerId: "ben",
                }),
            ],
            bills: [
                bill({ id: "b1", name: "Ava bill", potId: "p1", amount: 1000 }),
                bill({ id: "b2", name: "Ben bill", potId: "p2", amount: 2000 }),
                bill({
                    id: "b3",
                    name: "Household",
                    funding: "main",
                    categoryId: "c1",
                    amount: 500,
                }),
            ],
        });

    it("is a no-op for everyone", () => {
        const group = filterByOwner(groups()[0]!, ALL);

        expect(group.pots).toHaveLength(2);
        expect(group.perPeriod).toBe(3500);
    });

    it("keeps only that person's pots, and retotals", () => {
        const group = filterByOwner(groups()[0]!, "ava");

        expect(group.pots.map((p) => p.pot.id)).toEqual(["p1"]);
        expect(group.perPeriod).toBe(1000);
    });

    // A main-account bill belongs to the household, not to a person, so there is
    // no owner it could be filtered out by.
    it("leaves main-account bills in whoever is selected", () => {
        expect(filterByOwner(groups()[0]!, "ava").mainBills).toHaveLength(1);
        expect(filterByOwner(groups()[0]!, "ben").mainBills).toHaveLength(1);
    });
});

describe("totalPerPeriod", () => {
    it("sums every category", () => {
        const groups = build({
            categories: [category("c1", "One"), category("c2", "Two")],
            pots: [
                pot({ id: "p1", name: "A", categoryId: "c1" }),
                pot({ id: "p2", name: "B", categoryId: "c2" }),
            ],
            bills: [
                bill({ id: "b1", name: "A", potId: "p1", amount: 1500 }),
                bill({ id: "b2", name: "B", potId: "p2", amount: 2500 }),
            ],
        });

        expect(totalPerPeriod(groups)).toBe(4000);
    });
});

describe("slugify", () => {
    it("lowercases and hyphenates", () => {
        expect(slugify("Food & Drink")).toBe("food-drink");
        expect(slugify("Home & garden")).toBe("home-garden");
        expect(slugify("Savings & Goals")).toBe("savings-goals");
    });

    it("strips accents rather than dropping the letter", () => {
        expect(slugify("Café")).toBe("cafe");
    });

    it("leaves no leading or trailing hyphens", () => {
        expect(slugify("  Kids!  ")).toBe("kids");
        expect(slugify("— Giving —")).toBe("giving");
    });
});

describe("groupSlugs", () => {
    const groups = (names: string[]) =>
        build({
            categories: names.map((name, i) => category("c" + i, name)),
        });

    it("gives every category a slug of its name", () => {
        const slugs = groupSlugs(groups(["Housing", "Food & Drink"]));
        expect([...slugs.values()]).toEqual(["housing", "food-drink"]);
    });

    // Both would otherwise resolve to whichever came first, so picking the
    // second one would quietly show you the other.
    it("numbers a slug that is already taken", () => {
        const slugs = groupSlugs(groups(["Kids", "Kids!", "kids"]));
        expect([...slugs.values()]).toEqual(["kids", "kids-2", "kids-3"]);
    });

    it("still slugs a name with nothing slug-worthy in it", () => {
        const slugs = groupSlugs(groups(["£££"]));
        expect([...slugs.values()]).toEqual(["category"]);
    });

    it("keys by group, and names the uncategorised bucket", () => {
        const built = build({
            categories: [category("c1", "Housing")],
            pots: [pot({ id: "p1", name: "Stray", categoryId: null })],
        });
        const slugs = groupSlugs(built);
        expect(slugs.get("c1")).toBe("housing");
        expect(slugs.get(UNCATEGORISED)).toBe(UNCATEGORISED);
    });
});
