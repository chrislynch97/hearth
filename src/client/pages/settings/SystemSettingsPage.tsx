import { Navigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Spinner } from "@/components/ui/Spinner";
import { AboutSection } from "./AboutSection";
import { DataSection } from "./DataSection";
import { RegistrationSection } from "./RegistrationSection";
import { ResetAllData } from "./ResetAllData";
import { SignOutEveryoneSection } from "./SignOutEveryoneSection";
import { UpdatesSection } from "./UpdatesSection";

/** Settings for the whole instance, instance owner only — see issue #16. */
export const SystemSettingsPage = () => {
    const me = trpc.users.me.useQuery();

    // Instance-owner only. While loading, hold; if not permitted, bounce to Account
    // rather than render an empty page (the server also gates each endpoint).
    if (me.isLoading) return <Spinner label="Loading" />;
    if (!me.data?.isInstanceOwner)
        return <Navigate to="/settings/account" replace />;

    return (
        <div className="flex flex-col gap-10">
            <RegistrationSection />
            <DataSection />
            <UpdatesSection />
            <AboutSection />
            <SettingsSection
                title="Danger zone"
                description="Instance-wide, and they can't be undone."
                tone="danger"
            >
                <SignOutEveryoneSection />
                <ResetAllData />
            </SettingsSection>
        </div>
    );
};
