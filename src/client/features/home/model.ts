import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/trpc/router";

export type DashboardSummary =
    inferRouterOutputs<AppRouter>["dashboard"]["summary"];

/** "Good morning" until noon, "Good afternoon" until six, then evening. */
export const greetingFor = (hour: number): string => {
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
};
