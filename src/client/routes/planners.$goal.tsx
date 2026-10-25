import { createFileRoute } from "@tanstack/react-router";
import { SavingsGoalPage } from "@/pages/SavingsGoalPage";

/** One goal, by its slug: `/planners/wedding`. Just after a create the param
 *  is the new goal's id, which the page swaps for its slug. */
export const Route = createFileRoute("/planners/$goal")({
    component: SavingsGoalPage,
});
