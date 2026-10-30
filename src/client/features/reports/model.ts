import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/trpc/router";

export type Report = inferRouterOutputs<AppRouter>["reports"]["overview"];

/** `'2026-07'` → `'Jul 26'`. */
export const monthLabel = (month: string): string => {
    const [y = "", m = ""] = month.split("-");
    const name =
        [
            "",
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ][Number(m)] ?? m;
    return `${name} ${y.slice(2)}`;
};

export const pct = (part: number, whole: number): string => {
    if (whole <= 0) return "—";
    return `${Math.round((part / whole) * 100)}%`;
};

export interface CategorySpend {
    categoryId: string | null;
    name: string;
    spent: number;
    /** Planned funding this period; 0 means nothing is planned for it. */
    planned: number;
    /** Spend per month across the window, oldest first. */
    byMonth: number[];
}

/** The period's spending by category, joined to its plan and its recent trend.
 *  Led by spend: a planned category with none is a bill not logged as spending,
 *  not money saved, so it's left out rather than read as under budget. */
export const categorySpend = (report: Report): CategorySpend[] =>
    report.categoryBreakdown.rows.map((row) => ({
        ...row,
        planned:
            report.spendVsAllocation.find(
                (r) => r.categoryId === row.categoryId
            )?.planned ?? 0,
        byMonth:
            report.monthOverMonth.rows.find(
                (r) => r.categoryId === row.categoryId
            )?.byMonth ?? [],
    }));
