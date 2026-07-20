import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "@/pages/settings/AccountSettingsPage";

export const Route = createFileRoute("/settings/account")({
    component: AccountSettingsPage,
});
