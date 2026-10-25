import { createFileRoute } from "@tanstack/react-router";
import { SavingsPlannersPage } from "@/pages/SavingsPlannersPage";

export const Route = createFileRoute("/planners/")({
    component: SavingsPlannersPage,
});
