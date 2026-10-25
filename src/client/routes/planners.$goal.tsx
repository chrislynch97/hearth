import { createFileRoute } from "@tanstack/react-router";
import { SavingsPlannersPage } from "@/pages/SavingsPlannersPage";

/** The goal on screen lives in the URL, so a refresh or an Overview alert lands on it. */
export interface PlannersSearch {
    /** A goal id. Absent means the first live goal. */
    goal?: string;
}

export const Route = createFileRoute("/planners")({
    validateSearch: (search: Record<string, unknown>): PlannersSearch =>
        typeof search.goal === "string" && search.goal
            ? { goal: search.goal }
            : {},
    component: SavingsPlannersPage,
});
