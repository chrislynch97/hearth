import { describe, it, expect } from "vitest";
import { buildPlanText, mainAccountGroups, potsByOwner } from "./model";
import type { FundingPlan } from "./model";
import type { MoneyFormat } from "@/useMoney";
import type { Category, Member } from "../../../server/db/schema";

const now = new Date("2026-10-24");

const member = (id: string, displayName: string): Member => ({
    id,
    householdId: "household",
    userId: null,
    kind: "person",
    displayName,
    shortLabel: null,
    color: null,
    jointContributionWeight: null,
    sortOrder: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
});

const category = (id: string, name: string): Category => ({
    id,
    householdId: "household",
    name,
    sortOrder: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
});

const person = (memberId: string, displayName: string) => ({
    memberId,
    displayName,
    personalPotFunding: 7000,
    jointContribution: 1000,
    personalMainAccount: 0,
    setAside: 8000,
    periodIncome: 0,
    remainder: 0,
});

const makePlan = (over: Partial<FundingPlan> = {}): FundingPlan => ({
    pots: [],
    perPerson: [],
    jointPotFundingTotal: 0,
    unassignedFundingPerPeriod: 0,
    mainAccountFundingPerPeriod: 0,
    mainAccountByCategory: [],
    emergencyFund: {
        months: 3,
        totalMonthlyCommitments: 0,
        total: 0,
        perOwner: [],
    },
    jointFundingModel: "split",
    jointPool: { totalIn: 0, jointCosts: 0, surplus: 0 },
    coupleSurplus: 0,
    ...over,
});

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

describe("mainAccountGroups", () => {
    const members = [member("ava", "Ava"), member("ben", "Ben")];
    const categories = [
        category("subs", "Subscriptions"),
        category("home", "Home"),
    ];

    it("gives each paying account its own rows and total, joint first", () => {
        const plan = makePlan({
            perPerson: [person("ava", "Ava"), person("ben", "Ben")],
            mainAccountByCategory: [
                { categoryId: "subs", ownerId: "ben", fundingPerPeriod: 1000 },
                { categoryId: "subs", ownerId: null, fundingPerPeriod: 1200 },
                { categoryId: "home", ownerId: null, fundingPerPeriod: 3000 },
                { categoryId: "subs", ownerId: "ava", fundingPerPeriod: 800 },
            ],
        });

        const groups = mainAccountGroups(plan, members, categories);

        expect(groups.map((g) => [g.label, g.total])).toEqual([
            ["Joint", 4200],
            ["Ava", 800],
            ["Ben", 1000],
        ]);
        expect(groups[0]?.rows.map((r) => r.name)).toEqual([
            "Subscriptions",
            "Home",
        ]);
    });

    it("names a missing category Uncategorised and a missing owner Former member", () => {
        const plan = makePlan({
            mainAccountByCategory: [
                { categoryId: null, ownerId: "gone", fundingPerPeriod: 500 },
            ],
        });

        const [group] = mainAccountGroups(plan, members, categories);

        expect(group?.label).toBe("Former member");
        expect(group?.rows[0]?.name).toBe("Uncategorised");
    });
});

describe("potsByOwner", () => {
    it("skips pots with nothing to move", () => {
        const plan = makePlan({
            pots: [
                {
                    potId: "p1",
                    name: "Rail",
                    ownerId: "ava",
                    fundingPerPeriod: 500,
                },
                {
                    potId: "p2",
                    name: "Idle",
                    ownerId: "ava",
                    fundingPerPeriod: 0,
                },
            ],
        });

        expect(
            potsByOwner(plan)
                .get("ava")
                ?.map((p) => p.potId)
        ).toEqual(["p1"]);
    });
});

describe("buildPlanText", () => {
    it("lists own-account bills apart from the set-aside", () => {
        const plan = makePlan({
            perPerson: [{ ...person("ava", "Ava"), personalMainAccount: 800 }],
        });

        const text = buildPlanText(plan, money, "/mo");

        expect(text).toContain("→ By standing order  £80.00/mo");
        expect(text).toContain("Stays in own account  £8.00/mo");
        expect(text).toContain("→ Total spoken for  £88.00/mo");
    });
});
