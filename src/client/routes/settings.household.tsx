import { createFileRoute } from "@tanstack/react-router";
import { HouseholdSettingsPage } from "@/pages/settings/HouseholdSettingsPage";

export const Route = createFileRoute("/settings/household")({
    component: HouseholdSettingsPage,
});
