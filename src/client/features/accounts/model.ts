import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/trpc/router";

type AccountsOutputs = inferRouterOutputs<AppRouter>["accounts"];

export type AccountWithValue = AccountsOutputs["list"][number];
export type AccountsSummary = AccountsOutputs["summary"];
export type AccountKind = "asset" | "liability";

export interface OwnerOption {
    value: string;
    label: string;
}
