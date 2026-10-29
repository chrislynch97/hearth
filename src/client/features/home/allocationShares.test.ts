import { describe, expect, it } from "vitest";
import { allocationShares } from "@/features/home/allocationShares";

const cat = (name: string, funding: number) => ({ name, funding });

describe("allocationShares", () => {
    it("ranks categories largest first, as a share of income", () => {
        expect(
            allocationShares([cat("Food", 100), cat("Housing", 500)], 1000)
        ).toEqual([
            { label: "Housing", amount: 500, share: 0.5 },
            { label: "Food", amount: 100, share: 0.1 },
        ]);
    });

    it("rolls everything past the kept few into Other", () => {
        const shares = allocationShares(
            [cat("A", 50), cat("B", 40), cat("C", 30), cat("D", 20)],
            1000,
            2
        );
        expect(shares.map((s) => s.label)).toEqual(["A", "B", "Other"]);
        expect(shares[2]?.amount).toBe(50);
    });

    it("leaves out empty categories, and shares at zero with no income", () => {
        expect(allocationShares([cat("A", 0), cat("B", 10)], 0)).toEqual([
            { label: "B", amount: 10, share: 0 },
        ]);
    });
});
