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
