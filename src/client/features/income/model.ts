import type { inferRouterOutputs } from "@trpc/server";
import { subtractMonths } from "@shared/dates";
import type { AppRouter } from "../../../server/trpc/router";

type Outputs = inferRouterOutputs<AppRouter>;

export type Payslip = Outputs["payslips"]["list"][number];
export type PayslipComponent = Outputs["payslipComponents"]["list"][number];

/** Net pay across the twelve months up to `asOf`. */
export const rollingNet = (payslips: Payslip[], asOf: string): number => {
    const from = subtractMonths(asOf, 12);
    return payslips
        .filter((p) => p.payDate > from && p.payDate <= asOf)
        .reduce((sum, p) => sum + p.totals.effectiveNet, 0);
};
