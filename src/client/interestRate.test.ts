import { describe, it, expect } from "vitest";
import { formatAer, parseRate, rateInput, validRate } from "./interestRate";

describe("interest rates", () => {
    it("round-trips a rate through its field", () => {
        expect(rateInput(450)).toBe("4.50");
        expect(rateInput(null)).toBe("");
        expect(parseRate("4.5")).toBe(450);
        expect(parseRate("4.55")).toBe(455);
        expect(parseRate(" 4.25 % ")).toBe(425);
    });

    it("treats blank and zero as no interest", () => {
        expect(parseRate("")).toBeNull();
        expect(parseRate("0")).toBeNull();
        expect(parseRate("0.00")).toBeNull();
    });

    it("accepts up to 100 with two decimals, and nothing else", () => {
        expect(validRate("")).toBe(true);
        expect(validRate("4.5")).toBe(true);
        expect(validRate("4.5%")).toBe(true);
        expect(validRate("100")).toBe(true);
        for (const bad of ["100.01", "4.555", "-1", "abc", "4,5"]) {
            expect(validRate(bad)).toBe("Enter a rate like 4.5, up to 100.");
        }
    });

    it("shows a rate as AER", () => {
        expect(formatAer(425)).toBe("4.25% AER");
        expect(formatAer(500)).toBe("5.00% AER");
    });
});
