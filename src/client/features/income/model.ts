import type { inferRouterOutputs } from "@trpc/server";
import { subtractMonths } from "@shared/dates";
import type { Recurrence } from "@shared/recurrence";
import type { AppRouter } from "../../../server/trpc/router";

type Outputs = inferRouterOutputs<AppRouter>;

export type Payslip = Outputs["payslips"]["list"][number];
export type PayslipComponent = Outputs["payslipComponents"]["list"][number];
export type IncomeSource = Outputs["incomeSources"]["list"][number];
export type MemberIncome = Outputs["income"]["overview"]["perMember"][number];

export const RECURRENCES: Array<{ value: Recurrence; label: string }> = [
    { value: "monthly", label: "Monthly" },
    { value: "fortnightly", label: "Fortnightly" },
    { value: "weekly", label: "Weekly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
    { value: "one_off", label: "One-off" },
];

/** Net pay across the twelve months up to `asOf`. */
export const rollingNet = (payslips: Payslip[], asOf: string): number => {
    const from = subtractMonths(asOf, 12);
    return payslips
        .filter((p) => p.payDate > from && p.payDate <= asOf)
        .reduce((sum, p) => sum + p.totals.effectiveNet, 0);
};
