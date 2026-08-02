import { Navigate } from "@tanstack/react-router";
import { Loader, Stack } from "@mantine/core";
import { trpc } from "@/trpc";
import { RegistrationSection } from "./RegistrationSection";
import { SignOutEveryoneSection } from "./SignOutEveryoneSection";
import { DataSection } from "./DataSection";
import { UpdatesSection } from "./UpdatesSection";
import { AboutSection } from "./AboutSection";

/** Settings for the whole instance, instance owner only — see issue #16. */
export const SystemSettingsPage = () => {
    const me = trpc.users.me.useQuery();
    // Instance-owner only. While loading, hold; if not permitted, bounce to Account
    // rather than render an empty page (the server also gates each endpoint).
    if (me.isLoading) return <Loader size="sm" />;
    if (!me.data?.isInstanceOwner)
        return <Navigate to="/settings/account" replace />;
    return (
        <Stack gap="lg">
            <RegistrationSection />
            <SignOutEveryoneSection />
            <DataSection />
            <UpdatesSection />
            <AboutSection />
        </Stack>
    );
};
