import { createFileRoute } from "@tanstack/react-router";
import { SavingsGoalPage } from "@/pages/SavingsGoalPage";

/** One goal: `/planners/k3x9p2-wedding`. The short id at the front finds it;
 *  the name after it is for reading and follows renames. */
export const Route = createFileRoute("/planners/$goal")({
    component: SavingsGoalPage,
});
