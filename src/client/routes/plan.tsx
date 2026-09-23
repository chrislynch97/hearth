import { createFileRoute } from "@tanstack/react-router";
import { PlanPage } from "@/pages/PlanPage";
import { ALL } from "@/features/plan/model";

/** The selected category lives in the URL, so a refresh — or a link sent to the
 *  other half of the household — comes back to the same one. */
export interface PlanSearch {
    /** A category slug (`food-drink`) or `UNCATEGORISED`. Absent means all of
     *  them: the default stays out of the URL rather than sitting there as
     *  `?category=all`. */
    category?: string;
}

export const Route = createFileRoute("/plan")({
    validateSearch: (search: Record<string, unknown>): PlanSearch => {
        const category =
            typeof search.category === "string" ? search.category : "";

        return category && category !== ALL ? { category } : {};
    },
    component: PlanPage,
});
