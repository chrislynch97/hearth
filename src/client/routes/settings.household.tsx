import { createFileRoute } from "@tanstack/react-router";
import { HouseholdSettingsPage } from "@/pages/SettingsPage";

export const Route = createFileRoute("/settings/household")({
    component: HouseholdSettingsPage,
});
