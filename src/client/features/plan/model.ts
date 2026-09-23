import {
    normaliseToPeriod,
    roundMinor,
    type Recurrence,
} from "@shared/recurrence";
import type { PeriodFrequency } from "@shared/period";
import type {
    Category,
    Expense,
    Member,
    Pot,
    SetAside,
} from "../../../server/db/schema";

export type Funding = "pot_manual" | "pot_auto" | "main";

/** Every category is a key in the rail, and so is the bucket for things that
 *  have no category — a real place pots and main-account bills end up. */
export const ALL = "all";
export const UNCATEGORISED = "uncategorised";

export const fundingOf = (bill: Expense): Funding =>
    (bill.funding ?? "pot_manual") as Funding;

export interface PlanPot {
    pot: Pot;
    owner: Member | undefined;
    /** Money out: the bills this pot pays. */
    bills: Expense[];
    /** Money in: the recurring contributions that fill it. */
    setAsides: SetAside[];
    /** What has to land in the pot each budget period — bills plus set-asides,
     *  which is exactly how the funding plan derives a standing order. */
    perPeriod: number;
}

export interface PlanGroup {
    /** null is the uncategorised bucket. */
    categoryId: string | null;
    name: string;
    pots: PlanPot[];
    /** Bills paid straight from the main account under this category — no pot,
     *  so they belong to the category and nothing else. */
    mainBills: Expense[];
    perPeriod: number;
}

export const groupKey = (group: PlanGroup): string =>
    group.categoryId ?? UNCATEGORISED;

/** A category name as a URL slug: `Food & Drink` becomes `food-drink`. Ids are
 *  what everything internal keys off, but they have no business in a URL a
 *  person reads. */
export const slugify = (name: string): string =>
    name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** One slug per group, unique across the list. Two categories whose names
 *  slugify the same (`Food & Drink` and `Food and Drink`) would otherwise both
 *  point at whichever came first, so the later one gets a numbered suffix. A
 *  name with nothing slug-worthy in it (`£££`) still needs a slug. */
export const groupSlugs = (groups: PlanGroup[]): Map<string, string> => {
    const taken = new Map<string, number>();
    const slugs = new Map<string, string>();

    for (const group of groups) {
        const base = group.categoryId
            ? slugify(group.name) || "category"
            : UNCATEGORISED;
        const seen = taken.get(base) ?? 0;

        taken.set(base, seen + 1);
        slugs.set(groupKey(group), seen === 0 ? base : `${base}-${seen + 1}`);
    }

    return slugs;
};

const isActive = (bill: Expense): boolean =>
    bill.active === 1 && bill.archivedAt === null;

const perPeriodOf = (
    rows: { amount: number | null; recurrence: string }[],
    frequency: PeriodFrequency
): number =>
    rows.reduce(
        (acc, row) =>
            acc +
            normaliseToPeriod(
                row.amount ?? 0,
                row.recurrence as Recurrence,
                frequency
            ),
        0
    );

export interface BuildPlanInput {
    categories: Category[];
    pots: Pot[];
    bills: Expense[];
    setAsides: SetAside[];
    members: Member[];
    frequency: PeriodFrequency;
}

/** The whole plan as the page draws it: one group per category, each holding its
 *  pots (with the bills and set-asides attached to them) and the main-account
 *  bills that have no pot at all. Uncategorised comes last, and only when it has
 *  something in it. */
export const buildPlan = ({
    categories,
    pots,
    bills,
    setAsides,
    members,
    frequency,
}: BuildPlanInput): PlanGroup[] => {
    const activeBills = bills.filter(isActive);
    const memberById = new Map(members.map((member) => [member.id, member]));
    const livePotIds = new Set(
        pots.filter((pot) => pot.archivedAt === null).map((pot) => pot.id)
    );

    const billsByPot = new Map<string, Expense[]>();
    const mainBillsByCategory = new Map<string | null, Expense[]>();
    for (const bill of activeBills) {
        // Archiving a pot leaves its bills pointing at it. With no card to sit
        // in they would vanish, so they fall back here, where they can be opened
        // and given a new pot.
        if (
            fundingOf(bill) === "main" ||
            !bill.potId ||
            !livePotIds.has(bill.potId)
        ) {
            const key = bill.categoryId ?? null;
            mainBillsByCategory.set(key, [
                ...(mainBillsByCategory.get(key) ?? []),
                bill,
            ]);
            continue;
        }
        billsByPot.set(bill.potId, [
            ...(billsByPot.get(bill.potId) ?? []),
            bill,
        ]);
    }

    const setAsidesByPot = new Map<string, SetAside[]>();
    for (const row of setAsides) {
        if (row.active !== 1 || row.archivedAt !== null) continue;
        setAsidesByPot.set(row.potId, [
            ...(setAsidesByPot.get(row.potId) ?? []),
            row,
        ]);
    }

    const byName = (a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name);

    const planPotFor = (pot: Pot): PlanPot => {
        const potBills = (billsByPot.get(pot.id) ?? []).sort(byName);
        const potSetAsides = (setAsidesByPot.get(pot.id) ?? []).sort(
            (a, b) => a.sortOrder - b.sortOrder
        );

        return {
            pot,
            owner: memberById.get(pot.ownerId),
            bills: potBills,
            setAsides: potSetAsides,
            perPeriod: roundMinor(
                perPeriodOf(potBills, frequency) +
                    perPeriodOf(potSetAsides, frequency)
            ),
        };
    };

    const groupFor = (categoryId: string | null, name: string): PlanGroup => {
        const groupPots = pots
            .filter(
                (pot) =>
                    (pot.categoryId ?? null) === categoryId &&
                    pot.archivedAt === null
            )
            .sort(byName)
            .map(planPotFor);
        const mainBills = (mainBillsByCategory.get(categoryId) ?? []).sort(
            byName
        );

        return {
            categoryId,
            name,
            pots: groupPots,
            mainBills,
            perPeriod: roundMinor(
                groupPots.reduce((acc, p) => acc + p.perPeriod, 0) +
                    perPeriodOf(mainBills, frequency)
            ),
        };
    };

    // A pot whose category was archived reads as uncategorised, so match against
    // the categories actually on screen rather than the pot's stored id.
    const knownIds = new Set(categories.map((category) => category.id));
    const groups = categories.map((category) =>
        groupFor(category.id, category.name)
    );

    const orphanPots = pots.filter(
        (pot) =>
            pot.archivedAt === null &&
            (pot.categoryId === null || !knownIds.has(pot.categoryId))
    );
    const orphanBills = [...mainBillsByCategory.entries()]
        .filter(([key]) => key === null || !knownIds.has(key))
        .flatMap(([, rows]) => rows);

    if (orphanPots.length > 0 || orphanBills.length > 0) {
        const pots = orphanPots.sort(byName).map(planPotFor);
        const mainBills = orphanBills.sort(byName);
        groups.push({
            categoryId: null,
            name: "Uncategorised",
            pots,
            mainBills,
            perPeriod: roundMinor(
                pots.reduce((acc, p) => acc + p.perPeriod, 0) +
                    perPeriodOf(mainBills, frequency)
            ),
        });
    }

    return groups;
};

/** The same group with everything owned by somebody else taken out. A
 *  main-account bill has no owner, so it survives every owner filter — it is the
 *  household's, not a person's. */
export const filterByOwner = (
    group: PlanGroup,
    ownerId: string | typeof ALL
): PlanGroup => {
    if (ownerId === ALL) return group;
    const pots = group.pots.filter((p) => p.pot.ownerId === ownerId);

    return {
        ...group,
        pots,
        perPeriod: roundMinor(pots.reduce((acc, p) => acc + p.perPeriod, 0)),
    };
};

export const totalPerPeriod = (groups: PlanGroup[]): number =>
    roundMinor(groups.reduce((acc, group) => acc + group.perPeriod, 0));

export const countBills = (group: PlanGroup): number =>
    group.pots.reduce((acc, p) => acc + p.bills.length, 0) +
    group.mainBills.length;

export const countSetAsides = (group: PlanGroup): number =>
    group.pots.reduce((acc, p) => acc + p.setAsides.length, 0);
