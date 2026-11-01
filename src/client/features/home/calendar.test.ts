import { beforeEach, describe, expect, it } from "vitest";
import type { CalendarEvent } from "@shared/calendar";
import {
    eventsByDate,
    isWeekend,
    loadHiddenKinds,
    monthSummary,
    saveHiddenKinds,
} from "./calendar";

const event = (id: string, date: string): CalendarEvent => ({
    id,
    kind: "todo",
    date,
    title: id,
    amount: null,
    href: "/todos",
});

describe("eventsByDate", () => {
    it("gathers each date's events in order", () => {
        const byDate = eventsByDate([
            event("a", "2026-06-01"),
            event("b", "2026-06-02"),
            event("c", "2026-06-01"),
        ]);

        expect(byDate.get("2026-06-01")?.map((e) => e.id)).toEqual(["a", "c"]);
        expect(byDate.get("2026-06-02")?.map((e) => e.id)).toEqual(["b"]);
    });
});

describe("monthSummary", () => {
    const pounds = (amount: number) => `£${amount / 100}`;

    it("totals the bills and counts the rest", () => {
        const events: CalendarEvent[] = [
            { ...event("a", "2026-06-01"), kind: "bill", amount: 1000 },
            { ...event("b", "2026-06-02"), kind: "bill", amount: 2500 },
            event("c", "2026-06-03"),
            { ...event("d", "2026-06-04"), kind: "savings", amount: 90000 },
        ];

        expect(monthSummary(events, pounds)).toBe(
            "2 bills worth £35, 1 to-do, 1 savings date"
        );
    });

    it("says so when the month is empty", () => {
        expect(monthSummary([], pounds)).toBe("Nothing dated this month.");
    });
});

describe("isWeekend", () => {
    it("knows Saturday and Sunday from the rest", () => {
        expect(isWeekend("2026-11-01")).toBe(true);
        expect(isWeekend("2026-11-02")).toBe(false);
        expect(isWeekend("2026-11-07")).toBe(true);
    });
});

describe("hidden kinds", () => {
    beforeEach(() => localStorage.clear());

    it("remembers what was switched off", () => {
        saveHiddenKinds(["bill", "savings"]);

        expect(loadHiddenKinds()).toEqual(["bill", "savings"]);
    });

    it("starts with everything showing, and ignores anything unknown", () => {
        expect(loadHiddenKinds()).toEqual([]);

        localStorage.setItem("hearth.calendar.hiddenKinds", '["bill","nope"]');
        expect(loadHiddenKinds()).toEqual(["bill"]);

        localStorage.setItem("hearth.calendar.hiddenKinds", "not json");
        expect(loadHiddenKinds()).toEqual([]);
    });
});
