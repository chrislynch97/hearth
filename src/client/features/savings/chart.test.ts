import { describe, it, expect } from "vitest";
import type { PeriodConfig } from "@shared/period";
import type { SavingsPlanInput, SavingsPlanItem } from "@shared/savings";
import type { MoneyFormat } from "@/useMoney";
import {
    axisTicks,
    chartMoments,
    chartSeries,
    compactMoney,
    deadlineWindow,
    defaultMoment,
    inTime,
    niceTicks,
    tickLabels,
    time,
} from "./chart";

const period: PeriodConfig = { frequency: "monthly", startDay: 25, anchor: "" };

const gbp: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const item = (id: string, amount: number, dueDate: string | null): SavingsPlanItem => ({
    id,
    name: id,
    amount,
    dueDate,
    paidOn: null,
});

// £1,000 by 25 Apr: £600 due 30 Nov, £300 on 1 Feb, £100 unitemised. £100 in
// today and £100 going in on the 25th of each month.
const kitchen = (over: Partial<SavingsPlanInput> = {}): SavingsPlanInput => ({
    targetAmount: 100_000,
    targetDate: "2027-04-25",
    items: [item("Units", 60_000, "2026-11-30"), item("Tiles", 30_000, "2027-02-01")],
    balances: [{ asOfDate: "2026-10-24", amount: 10_000 }],
    contribution: 10_000,
    today: "2026-10-24",
    period,
    ...over,
});

describe("chartMoments", () => {
    it("reads the plan at today, each deadline and the goal date", () => {
        expect(chartMoments(kitchen(), null)).toEqual([
            { date: "2026-10-24", kind: "today", due: [], needed: 0, pot: 10_000, whatIf: null },
            // Paydays on 25 Oct and 25 Nov.
            { date: "2026-11-30", kind: "deadline", due: [{ name: "Units", amount: 60_000 }], needed: 60_000, pot: 30_000, whatIf: null },
            { date: "2027-02-01", kind: "deadline", due: [{ name: "Tiles", amount: 30_000 }], needed: 90_000, pot: 50_000, whatIf: null },
            { date: "2027-04-25", kind: "deadline", due: [{ name: "Not itemised yet", amount: 10_000 }], needed: 100_000, pot: 80_000, whatIf: null },
        ]);
    });

    it("carries a what-if alongside, date by date", () => {
        expect(chartMoments(kitchen(), 40_000).map((m) => m.whatIf)).toEqual([10_000, 90_000, 170_000, 290_000]);
    });

    it("counts anything overdue as due today, and marks a goal date with nothing on it", () => {
        const moments = chartMoments(
            kitchen({
                targetAmount: 90_000,
                items: [item("Deposit", 60_000, "2026-10-01"), item("Tiles", 30_000, "2027-02-01")],
            }),
            null
        );
        expect(moments[0]).toMatchObject({ kind: "today", due: [{ name: "Deposit", amount: 60_000 }], needed: 60_000 });
        expect(moments.at(-1)).toMatchObject({ date: "2027-04-25", kind: "goal", due: [] });
    });
});

describe("defaultMoment", () => {
    it("opens on the first deadline the money misses", () => {
        expect(defaultMoment(chartMoments(kitchen(), null))?.date).toBe("2026-11-30");
    });

    it("opens on the next deadline when nothing is missed", () => {
        const covered = chartMoments(kitchen({ contribution: 40_000 }), null);
        expect(defaultMoment(covered)?.date).toBe("2026-11-30");
        expect(defaultMoment(covered.slice(0, 1))?.kind).toBe("today");
    });
});

describe("chartSeries", () => {
    it("runs from the first recorded balance to the goal date", () => {
        const series = chartSeries(
            kitchen({ balances: [{ asOfDate: "2026-09-01", amount: 5_000 }, { asOfDate: "2026-10-24", amount: 10_000 }] }),
            10_000,
            null
        );
        expect(series.history.map((p) => p.value)).toEqual([5_000, 10_000, 10_000]);
        expect(series.start).toBe(time("2026-09-01"));
        expect(series.end).toBe(time("2027-04-25"));
        expect(series.whatIf).toBeNull();
    });

    it("has no history until a balance is recorded", () => {
        expect(chartSeries(kitchen({ balances: [] }), 0, null).history).toEqual([]);
    });
});

describe("inTime", () => {
    it("says roughly how far off a date is", () => {
        expect(inTime("2026-10-24", "2026-10-24")).toBe("today");
        expect(inTime("2026-10-24", "2026-10-25")).toBe("tomorrow");
        expect(inTime("2026-10-24", "2026-10-30")).toBe("in 6 days");
        expect(inTime("2026-10-24", "2026-11-21")).toBe("in 4 weeks");
        expect(inTime("2026-10-24", "2027-04-24")).toBe("in 6 months");
        expect(inTime("2026-10-24", "2029-10-24")).toBe("in 3 years");
    });
});

describe("niceTicks and compactMoney", () => {
    it("steps the money axis in round amounts that cover the top", () => {
        expect(niceTicks(1_500_000)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
        expect(niceTicks(134_000)).toEqual([0, 50_000, 100_000, 150_000]);
        expect(niceTicks(0)).toEqual([0, 1]);
    });

    it("labels it compactly, in the household's currency", () => {
        expect(compactMoney(1_500_000, gbp)).toBe("£15k");
        expect(compactMoney(250_000, gbp)).toBe("£2.5k");
        expect(compactMoney(80_000, gbp)).toBe("£800");
        expect(compactMoney(250_000, { ...gbp, symbol: "kr", symbolPosition: "suffix", decimalSeparator: "," })).toBe("2,5k\u00A0kr");
    });
});

const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("axisTicks", () => {
    const today = utc("2026-10-24");
    const gaps = (ticks: number[], start: number, end: number, width: number) =>
        ticks.slice(1).map((t, i) => ((t - ticks[i]!) / (end - start)) * width);

    it("labels a year monthly on the 1st, with Today first and nothing crowding it", () => {
        const end = utc("2027-10-24");
        const { ticks, tier } = axisTicks(today, end, today, 1200);
        expect(tier).toBe("month");
        expect(ticks[0]).toBe(today);
        expect(ticks.slice(1).every((t) => new Date(t).getUTCDate() === 1)).toBe(true);
        // 1 Nov is a week from Today: too close to label.
        expect(ticks).not.toContain(utc("2026-11-01"));
        expect(ticks).toContain(utc("2026-12-01"));
        expect(Math.min(...gaps(ticks, today, end, 1200))).toBeGreaterThanOrEqual(56);
    });

    it("thins to fit a phone, still keeping Today", () => {
        const end = utc("2027-10-24");
        const { ticks } = axisTicks(today, end, today, 300);
        expect(ticks[0]).toBe(today);
        expect(ticks.length).toBeLessThanOrEqual(5);
        expect(Math.min(...gaps(ticks, today, end, 300))).toBeGreaterThanOrEqual(56);
    });

    it("keeps Today mid-axis when recorded balances come before it", () => {
        expect(axisTicks(utc("2026-04-01"), utc("2027-10-24"), today, 900).ticks).toContain(today);
    });

    it("goes weekly for a short window, quarterly over a few years, yearly beyond", () => {
        const zoom = axisTicks(utc("2028-05-01"), utc("2028-06-12"), today, 800);
        expect(zoom.tier).toBe("week");
        expect(zoom.ticks).not.toContain(today);

        const quarters = axisTicks(today, utc("2029-10-24"), today, 800);
        expect(quarters.tier).toBe("quarter");
        expect(quarters.ticks.slice(1).every((t) => new Date(t).getUTCMonth() % 3 === 0)).toBe(true);

        const years = axisTicks(today, utc("2032-10-24"), today, 800);
        expect(years.tier).toBe("year");
        expect(years.ticks.slice(1).every((t) => new Date(t).getUTCMonth() === 0)).toBe(true);
    });

    it("names Today, and gives a month its year whenever the year turns", () => {
        expect(
            tickLabels(
                [utc("2026-04-01"), utc("2026-07-01"), today, utc("2027-07-01"), utc("2028-04-01")],
                "month",
                today,
                "en-GB"
            )
        ).toEqual(["Apr 2026", "Jul", "Today", "Jul 2027", "Apr 2028"]);
        expect(tickLabels([utc("2028-01-01")], "year", today, "en-GB")).toEqual(["2028"]);
    });

    it("writes dates the household's way, not the browser's", () => {
        expect(tickLabels([utc("2026-11-03")], "week", today, "en-GB")).toEqual(["3 Nov"]);
        expect(tickLabels([utc("2026-11-03")], "week", today, "en-US")).toEqual(["Nov 3"]);
    });
});

describe("deadlineWindow", () => {
    const input = (dues: (string | null)[]): SavingsPlanInput => ({
        targetAmount: 100_000,
        targetDate: "2027-10-24",
        items: dues.map((due, i) => ({ id: `i${i}`, name: `i${i}`, amount: 10_000, dueDate: due, paidOn: null })),
        balances: [],
        contribution: 0,
        today: "2026-10-24",
        period,
    });

    it("starts a month before deadlines bunched at the end", () => {
        expect(deadlineWindow(input(["2027-09-20", "2027-10-01"]))).toBe("2027-08-20");
    });

    it("has nothing to zoom to when deadlines are spread out, or all on the day", () => {
        expect(deadlineWindow(input(["2027-01-15", "2027-10-01"]))).toBeNull();
        expect(deadlineWindow(input([null, "2027-10-24"]))).toBeNull();
    });
});
