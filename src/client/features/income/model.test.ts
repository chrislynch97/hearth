import { describe, it, expect } from "vitest";
import { rollingNet, type Payslip } from "./model";

const payslip = (payDate: string, effectiveNet: number) =>
    ({ payDate, totals: { effectiveNet } }) as unknown as Payslip;

describe("rollingNet", () => {
    it("sums the twelve months up to the date, not the one a year before", () => {
        const payslips = [
            payslip("2025-10-28", 100),
            payslip("2025-10-29", 200),
            payslip("2026-10-28", 400),
            payslip("2026-11-28", 800),
        ];

        expect(rollingNet(payslips, "2026-10-28")).toBe(600);
    });
});
