import { describe, it, expect } from "vitest";
import {
    dueLabel,
    dueWithin,
    inMonth,
    monthCells,
    shiftMonth,
    totalOf,
    weekdayNames,
    type Payment,
} from "./model";

const payment = (date: string, amount: number) => ({ date, amount }) as Payment;

describe("monthCells", () => {
    it("starts November 2026, a Sunday the 1st, on the right weekday", () => {
        const sundayFirst = monthCells("2026-11", 0);
        const mondayFirst = monthCells("2026-11", 1);

        expect(sundayFirst[0]).toBe("2026-11-01");
        expect(mondayFirst.slice(0, 7)).toEqual([
            null,
            null,
            null,
            null,
            null,
            null,
            "2026-11-01",
        ]);
    });

    it("runs to the month's real last day", () => {
        expect(monthCells("2026-11", 1).at(-1)).toBe("2026-11-30");
        expect(monthCells("2028-02", 1).at(-1)).toBe("2028-02-29");
    });
});

describe("weekdayNames", () => {
    it("follows the household's first day of the week", () => {
        expect(weekdayNames(1, "en-GB")[0]).toBe("Mon");
        expect(weekdayNames(0, "en-GB")[0]).toBe("Sun");
        expect(weekdayNames(1, "en-GB")[6]).toBe("Sun");
    });
});

describe("shiftMonth", () => {
    it("crosses year ends in both directions", () => {
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    });
});

describe("payment windows", () => {
    const payments = [
        payment("2026-10-30", 100),
        payment("2026-11-05", 200),
        payment("2026-11-06", 400),
        payment("2026-12-01", 800),
    ];

    it("counts today as the first of the seven days", () => {
        expect(totalOf(dueWithin(payments, "2026-10-30", 7))).toBe(300);
    });

    it("picks out a month", () => {
        expect(totalOf(inMonth(payments, "2026-11"))).toBe(600);
    });
});

describe("dueLabel", () => {
    it("reads in words near today", () => {
        expect(dueLabel(0)).toBe("Today");
        expect(dueLabel(1)).toBe("Tomorrow");
        expect(dueLabel(9)).toBe("In 9 days");
    });
});
