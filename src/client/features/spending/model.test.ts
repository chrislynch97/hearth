import { describe, it, expect } from "vitest";
import {
    dayHeading,
    draftAmount,
    draftError,
    groupByDay,
    needsPot,
    statusInput,
    type Spend,
    type SpendDraft,
} from "./model";

const spend = (date: string, amount: number, over: Partial<Spend> = {}) =>
    ({ date, amount, potId: null, settledAtSource: 0, ...over }) as Spend;

const draft = (over: Partial<SpendDraft> = {}): SpendDraft => ({
    amount: "12.50",
    refund: false,
    description: "Tesco",
    date: "2026-10-30",
    ownerId: "ava",
    funding: { potId: null, categoryId: null, settledAtSource: false },
    ...over,
});

describe("groupByDay", () => {
    it("runs same-day spends together, netting refunds off the day's total", () => {
        const days = groupByDay([
            spend("2026-10-30", 1000),
            spend("2026-10-30", -250),
            spend("2026-10-29", 500),
        ]);

        expect(days.map((d) => [d.date, d.total, d.spends.length])).toEqual([
            ["2026-10-30", 750, 2],
            ["2026-10-29", 500, 1],
        ]);
    });
});

describe("dayHeading", () => {
    const today = "2026-10-30";

    it("names the recent days and keeps the rest short", () => {
        expect(dayHeading(today, today, "en-GB")).toBe("Today");
        expect(dayHeading("2026-10-29", today, "en-GB")).toBe("Yesterday");
        expect(dayHeading("2026-10-28", today, "en-GB")).toBe("Wed 28 Oct");
    });

    it("only adds the year once it isn't this one", () => {
        expect(dayHeading("2025-12-31", today, "en-GB")).toContain("2025");
    });
});

describe("statusInput", () => {
    it("maps each status onto the list filters", () => {
        expect(statusInput("all")).toEqual({});
        expect(statusInput("needs-pot")).toEqual({ needsPot: true });
        expect(statusInput("pending")).toEqual({ reconciled: false });
        expect(statusInput("reconciled")).toEqual({ reconciled: true });
    });
});

describe("draftError", () => {
    it("wants an amount, a description and someone who paid", () => {
        expect(draftError(draft())).toBeNull();
        expect(draftError(draft({ amount: "0" }))).toMatch(/amount/);
        expect(draftError(draft({ amount: "abc" }))).toMatch(/amount/);
        expect(draftError(draft({ description: "  " }))).toMatch(/description/);
        expect(draftError(draft({ ownerId: null }))).toMatch(/who paid/);
    });
});

describe("draftAmount", () => {
    it("stores spending positive and refunds negative", () => {
        expect(draftAmount(draft(), 2)).toBe(1250);
        expect(draftAmount(draft({ refund: true }), 2)).toBe(-1250);
    });
});

describe("needsPot", () => {
    it("tells an unassigned spend from a main-account one", () => {
        expect(needsPot(spend("2026-10-30", 100))).toBe(true);
        expect(needsPot(spend("2026-10-30", 100, { settledAtSource: 1 }))).toBe(
            false
        );
        expect(needsPot(spend("2026-10-30", 100, { potId: "pot" }))).toBe(
            false
        );
    });
});
