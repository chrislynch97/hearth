import { describe, it, expect } from "vitest";
import { ageLabel } from "./relativeDate";

describe("ageLabel", () => {
    it("names today and yesterday", () => {
        expect(ageLabel(0)).toBe("today");
        expect(ageLabel(1)).toBe("yesterday");
    });

    it("treats a future date as today", () => {
        expect(ageLabel(-3)).toBe("today");
    });

    it("counts days below a month", () => {
        expect(ageLabel(2)).toBe("2d ago");
        expect(ageLabel(30)).toBe("30d ago");
    });

    it("switches to months at 31 days", () => {
        expect(ageLabel(31)).toBe("1mo ago");
        expect(ageLabel(364)).toBe("12mo ago");
    });

    it("switches to years at 365 days", () => {
        expect(ageLabel(365)).toBe("1y ago");
        expect(ageLabel(800)).toBe("2y ago");
    });

    // The coverage strip's case: a long recording gap used to render as an
    // unbounded day count ("400 days ago").
    it("bands a long gap rather than counting raw days", () => {
        expect(ageLabel(45)).toBe("1mo ago");
        expect(ageLabel(400)).toBe("1y ago");
    });
});
