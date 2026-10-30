import { trpc } from "@/trpc";
import { Switch } from "@/components/shadcn/switch";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";

/** Instance-wide registration toggle (System scope) — it governs the whole
 *  instance, not one household. */
export const RegistrationSection = () => {
    const utils = trpc.useUtils();
    const regOpen = trpc.auth.registrationOpen.useQuery();
    const setRegOpen = trpc.auth.setRegistrationOpen.useMutation();

    return (
        <SettingsSection
            title="Sign-ups"
            description="Whether new people can join this instance on their own."
        >
            <SettingsRow
                title="Allow anyone to register"
                description="When on, the sign-in screen lets new people create their own account and household. Leave off to stay invite-only."
            >
                <Switch
                    aria-label="Allow anyone to register"
                    checked={regOpen.data?.allowOpenRegistration ?? false}
                    disabled={setRegOpen.isPending}
                    onCheckedChange={async (open) => {
                        await setRegOpen.mutateAsync({ open });
                        await utils.auth.registrationOpen.invalidate();
                    }}
                />
            </SettingsRow>
        </SettingsSection>
    );
};
