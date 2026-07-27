import { describe, it, expect } from "vitest";
import { moneyFormat, shareSummary } from "./microcharts";

const gbp = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix" as const,
    groupSeparator: ",",
    decimalSeparator: ".",
};

describe("moneyFormat", () => {
    it("formats minor units as the household's currency", () => {
        expect(moneyFormat(gbp)(123456)).toBe("£1,234.56");
    });

    it("rounds away the float noise charts introduce", () => {
        // Charts format differences and ratios, not the raw inputs: a
        // value − target of exactly 360 can arrive as 359.9999999999994.
        expect(moneyFormat(gbp)(359.9999999999994)).toBe("£3.60");
    });

    it("follows a suffix-symbol household", () => {
        const eur = {
            ...gbp,
            symbol: "€",
            symbolPosition: "suffix" as const,
            groupSeparator: ".",
            decimalSeparator: ",",
        };
        expect(moneyFormat(eur)(123456)).toBe("1.234,56 €");
    });
});

describe("shareSummary", () => {
    it("describes a part of a whole", () => {
        expect(shareSummary(25, 100, "household income")).toBe(
            "25% of household income"
        );
    });

    it("reads 0% rather than NaN when there is no whole", () => {
        expect(shareSummary(0, 0, "spending this period")).toBe(
            "0% of spending this period"
        );
    });
});
