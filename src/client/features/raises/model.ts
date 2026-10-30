import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/trpc/router";

export type Raise = inferRouterOutputs<AppRouter>["raises"]["list"][number];
