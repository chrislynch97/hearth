import { describe, it, expect } from "vitest";
import { planTarget, savingsPlan } from "@shared/savings";
import type { PeriodConfig } from "@shared/period";
import type { MoneyFormat } from "@/useMoney";
import {
    findGoal,
    nextDueLabel,
    plannerInput,
    verdict,
    whatIfSentence,
    type GoalDetail,
} from "./model";
import type {
    SavingsBalance,
    SavingsGoal,
    SavingsItem,
} from "../../../server/db/schema";

const now = new Date("2026-10-24");
const period: PeriodConfig = { frequency: "monthly", startDay: 25, anchor: "" };

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const formatDate = (iso: string) => iso;

const goalRow = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
    id: "wedding",
    householdId: "household",
    potId: "pot",
    shortId: "k3x9p2",
    name: "Wedding",
    targetAmount: 2_800_000,
    targetDate: "2028-06-12",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
});

const item = (id: string, amount: number, dueDate: string | null): SavingsItem => ({
    id,
    householdId: "household",
    goalId: "wedding",
    name: id,
    amount,
    dueDate,
    paidOn: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
});

const balance: SavingsBalance = {
    id: "b",
    householdId: "household",
    goalId: "wedding",
    asOfDate: "2026-10-20",
    amount: 1_150_000,
    note: null,
    createdAt: now,
    updatedAt: now,
};

/** The sample wedding at a given contribution, planned as the server would. */
const detail = (
    contribution: number,
    over: Partial<Omit<GoalDetail, "plan">> = {}
): GoalDetail => {
    const base = {
        goal: goalRow(),
        slug: "k3x9p2-wedding",
        potName: "Wedding",
        interestRateBp: null,
        items: [item("Catering", 750_000, "2028-05-29"), item("Photographer", 200_000, null)],
        balances: [balance],
        contribution,
        contributionLineCount: 1,
        period,
        today: "2026-10-24",
        ...over,
    };
    const planned = { ...base, target: planTarget(base.goal, base.items, base.today) };
    const plan = savingsPlan(plannerInput({ ...planned, plan: undefined as never }));
    return { ...planned, plan };
};

describe("findGoal", () => {
    const kitchen = {
        goal: goalRow({ id: "a", shortId: "aaaaaa", name: "Kitchen" }),
    } as GoalDetail;
    const wedding = {
        goal: goalRow({ id: "b", shortId: "k3x9p2", archivedAt: now }),
    } as GoalDetail;

    it("finds a goal by its short id, archived or not", () => {
        expect(findGoal([kitchen, wedding], "k3x9p2-wedding")).toBe(wedding);
    });

    it("ignores the name after the short id, so old links still land", () => {
        expect(findGoal([kitchen, wedding], "k3x9p2-our-old-name")).toBe(wedding);
        expect(findGoal([kitchen, wedding], "k3x9p2")).toBe(wedding);
    });

    it("finds nothing without a known short id, rather than another goal", () => {
        expect(findGoal([kitchen, wedding], "wedding")).toBeUndefined();
        expect(findGoal([kitchen, wedding], "zzzzzz-wedding")).toBeUndefined();
    });
});

describe("verdict", () => {
    it("when over, says how low you could go and offers nothing", () => {
        const v = verdict(detail(90_000), money, formatDate);
        expect(v.tone).toBe("over");
        expect(v.lead).toBe("£900.00/mo puts you £1,500.00 over");
        expect(v.rest).toBe(
            " by 2028-06-12. You could drop to £825.00/mo and still hit £28,000.00."
        );
        expect(v.needed).toBeNull();
    });

    it("when short, gives the figure that covers every item", () => {
        const v = verdict(detail(60_000), money, formatDate);
        expect(v.tone).toBe("short");
        expect(v.lead).toBe(
            "£600.00/mo leaves you £4,500.00 short on 2028-06-12"
        );
        expect(v.rest).toBe(". Needs £825.00/mo to cover every item on time.");
        expect(v.needed).toBe(82_500);
    });

    it("never calls a missed early deadline over", () => {
        // A £14,000 deposit due 25 Nov: £11,500 + two paydays can't reach it,
        // though the day itself ends over.
        const d = detail(90_000, {
            items: [item("Deposit", 1_400_000, "2026-11-25")],
        });
        const v = verdict(d, money, formatDate);
        expect(v.tone).toBe("short");
        expect(v.lead).toBe(
            "£900.00/mo leaves you £1,500.00 over on 2028-06-12 but late for 2026-11-25"
        );
        expect(v.needed).toBe(125_000);
    });

    it("says on target, not £0.00 over, when the day is met exactly", () => {
        // £11,500 + 20 paydays at £900 = £29,500, the target exactly.
        const d = detail(90_000, {
            goal: goalRow({ targetAmount: 2_950_000 }),
            items: [item("Deposit", 1_400_000, "2026-11-25")],
        });
        expect(verdict(d, money, formatDate).lead).toBe(
            "£900.00/mo leaves you on target on 2028-06-12 but late for 2026-11-25"
        );
    });

    it("names an item no payday can reach and offers nothing for it", () => {
        const d = detail(90_000, {
            items: [item("Fence", 1_500_000, "2026-10-24")],
        });
        const v = verdict(d, money, formatDate);
        expect(v.rest).toBe(
            ". Fence can't be covered by 2026-10-24: there's no payday before then. Record a top-up, or move the date."
        );
        expect(v.needed).toBeNull();
    });
});

describe("whatIfSentence", () => {
    const input = plannerInput(detail(90_000));

    it("says when a higher amount reaches the target, and how early", () => {
        const { lead, rest } = whatIfSentence(input, 110_000, money, formatDate);
        expect(lead).toBe("At £1,100.00/mo");
        // £16,500 to go at £1,100 = 15 paydays → 25 Dec 2027.
        expect(rest).toBe(
            " you reach £28,000.00 on 2027-12-25, 6 months early, and end £5,500.00 over."
        );
    });

    it("names what a lower amount leaves short", () => {
        const { rest } = whatIfSentence(input, 60_000, money, formatDate);
        expect(rest).toBe(
            " you're £4,500.00 short on 2028-06-12. The photographer and £18,500.00 not itemised fall short, first on 2028-06-12."
        );
    });
});

describe("nextDueLabel", () => {
    const itemByItem = goalRow({ targetAmount: null, targetDate: null });
    const paid = (row: SavingsItem): SavingsItem => ({ ...row, paidOn: "2026-10-01" });
    const away = item("My away hen", 60_000, "2027-03-14");
    const home = item("My home hen", 15_000, "2027-04-10");

    it("names the next item still to pay", () => {
        const hens = detail(0, { goal: itemByItem, items: [paid(away), home] });
        expect(nextDueLabel(hens, formatDate)).toBe("Next: My home hen, 2027-04-10");
    });

    it("says when everything's paid, or nothing's been added", () => {
        expect(nextDueLabel(detail(0, { goal: itemByItem, items: [paid(away), paid(home)] }), formatDate)).toBe("All paid");
        expect(nextDueLabel(detail(0, { goal: itemByItem, items: [] }), formatDate)).toBe("No items yet");
    });
});
