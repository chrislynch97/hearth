import { describe, it, expect, afterEach, vi } from "vitest";
import { daysSince, today } from "./util";

// These read the wall clock, so pin it rather than assert against "now".
const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
};

afterEach(() => {
    vi.useRealTimers();
});

describe("daysSince", () => {
    it("counts whole days back to the date", () => {
        at("2026-03-20T12:00:00Z");
        expect(daysSince("2026-03-10")).toBe(10);
    });

    it("is 0 for today", () => {
        at("2026-03-20T12:00:00Z");
        expect(daysSince("2026-03-20")).toBe(0);
    });

    it("counts across a month boundary", () => {
        at("2026-03-02T00:00:00Z");
        expect(daysSince("2026-02-28")).toBe(2);
    });

    it("counts across a leap day", () => {
        at("2028-03-01T00:00:00Z");
        expect(daysSince("2028-02-28")).toBe(2);
    });

    it("returns 0 for an unparseable date rather than NaN", () => {
        expect(daysSince("")).toBe(0);
        expect(daysSince("not-a-date")).toBe(0);
    });

    // Guards the falsy-check in the parser: month and day are 1-based, so a 0
    // component is as malformed as a missing one.
    it("returns 0 for a zeroed component", () => {
        expect(daysSince("2026-00-10")).toBe(0);
        expect(daysSince("0000-01-01")).toBe(0);
    });
});

describe("today", () => {
    it("is the current date as an ISO day", () => {
        at("2026-03-20T12:00:00Z");
        expect(today()).toBe("2026-03-20");
    });

    it("round-trips through daysSince as 0", () => {
        at("2026-07-04T09:30:00Z");
        expect(daysSince(today())).toBe(0);
    });
});
