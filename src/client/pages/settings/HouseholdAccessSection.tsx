import { trpc } from "@/trpc";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { AccessList } from "./AccessList";
import { InviteSection } from "./InviteSection";

/** Who can get into this household, how to bring someone new in, and — for
 *  anyone in more than one — which household is showing. */
export const HouseholdAccessSection = () => {
    const utils = trpc.useUtils();
    const me = trpc.users.me.useQuery();
    const switchHousehold = trpc.users.switchHousehold.useMutation();

    if (!me.data) return null;

    const role = me.data.role;
    const isAdmin = role === "admin" || role === "owner";
    const isOwner = role === "owner";
    const memberships = me.data.memberships;

    const handleSwitch = async (householdId: string) => {
        if (householdId === me.data?.activeHouseholdId) return;
        await switchHousehold.mutateAsync({ householdId });
        // Active household changed — everything is scoped to it, so refetch all.
        await utils.invalidate();
        window.location.reload();
    };

    return (
        <>
            {memberships.length > 1 && (
                <SettingsSection
                    title="Your households"
                    description="You belong to more than one. Pick which one you're looking at."
                >
                    <ChoiceField
                        label="Active household"
                        options={memberships.map((m) => ({
                            value: m.householdId,
                            label: `${m.householdName} · ${m.role}`,
                        }))}
                        value={me.data.activeHouseholdId}
                        onChange={(id) => void handleSwitch(id)}
                    />
                </SettingsSection>
            )}

            <SettingsSection
                title="People with access"
                description="Logins that can open this household, and what each may do."
            >
                {isAdmin ? (
                    <AccessList isOwner={isOwner} />
                ) : (
                    <p className="text-base text-text-muted">
                        You&apos;re a {role} of this household. Ask an admin to
                        invite others.
                    </p>
                )}
            </SettingsSection>

            {isAdmin && <InviteSection isOwner={isOwner} />}
        </>
    );
};
