import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/pages/SettingsPage";

export const Route = createFileRoute("/settings")({
    component: SettingsLayout,
});
