import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { Menu, UnstyledButton } from "@mantine/core";
import { ChevronDown } from "lucide-react";
import { PersonAvatar } from "@/layout/PersonAvatar";
import { FeedbackModal } from "@/layout/FeedbackModal";

export interface UserMenuProps {
    /** Avatar only, for the 72px rail on Overview where there's no page-list
     *  tier to hold the full row. */
    compact?: boolean;
}

export const UserMenu = ({ compact = false }: UserMenuProps) => {
    const navigate = useNavigate();

    const utils = trpc.useUtils();
    const me = trpc.users.me.useQuery();
    const status = trpc.auth.status.useQuery();
    const feedback = trpc.feedback.config.useQuery();
    const logout = trpc.auth.logout.useMutation();
    const switchHousehold = trpc.users.switchHousehold.useMutation();

    const [feedbackOpen, setFeedbackOpen] = useState(false);

    const name = me.data?.displayName || me.data?.username || "You";
    const memberships = me.data?.memberships ?? [];
    const active = memberships.find(
        (m) => m.householdId === me.data?.activeHouseholdId
    );
    const canLogOut = status.data?.passwordSet ?? false;

    const handleLogout = async () => {
        await logout.mutateAsync();
        // Invalidate ONLY auth.status: it re-fetches alone and returns 200
        // (authenticated: false), flipping the app to the login screen. Invalidating
        // everything would re-fire the protected queries — still mounted for a tick —
        // which the locked HTTP gate 401s as a batch, erroring auth.status with them
        // and surfacing the connection-error screen instead of the login gate.
        await utils.auth.status.invalidate();
    };

    const switchTo = async (householdId: string) => {
        if (householdId === me.data?.activeHouseholdId) return;
        await switchHousehold.mutateAsync({ householdId });
        // Everything is scoped to the active household — reload for a clean slate.
        await utils.invalidate();
        window.location.reload();
    };

    return (
        <>
            <FeedbackModal
                opened={feedbackOpen}
                onClose={() => setFeedbackOpen(false)}
            />
            <Menu position="top-start" width={230} withinPortal shadow="md">
                <Menu.Target>
                    <UnstyledButton
                        className="w-full"
                        aria-label="Account menu"
                    >
                        {compact ? (
                            <div className="flex h-11 w-full items-center justify-center rounded-md transition-colors duration-[140ms] ease-out hover:bg-hover">
                                <PersonAvatar name={name} />
                            </div>
                        ) : (
                            <div className="flex h-11 w-full items-center gap-2.5 rounded-md px-2 transition-colors duration-[140ms] ease-out hover:bg-hover">
                                <PersonAvatar name={name} />
                                <div className="min-w-0 flex-1 text-left">
                                    <div className="truncate text-sm font-medium leading-tight text-text">
                                        {name}
                                    </div>
                                    {active && (
                                        <div className="truncate text-xs leading-tight text-text-muted">
                                            {active.householdName}
                                        </div>
                                    )}
                                </div>
                                <ChevronDown
                                    size={13}
                                    strokeWidth={1.5}
                                    className="shrink-0 text-text-faint"
                                />
                            </div>
                        )}
                    </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>
                        {me.data?.username ? `@${me.data.username}` : "Account"}
                        {me.data?.role ? ` · ${me.data.role}` : ""}
                    </Menu.Label>
                    {memberships.length > 1 && (
                        <>
                            <Menu.Label>Switch household</Menu.Label>
                            {memberships.map((m) => (
                                <Menu.Item
                                    key={m.householdId}
                                    onClick={() => void switchTo(m.householdId)}
                                    rightSection={
                                        m.householdId ===
                                        me.data?.activeHouseholdId
                                            ? "✓"
                                            : undefined
                                    }
                                >
                                    {m.householdName}
                                </Menu.Item>
                            ))}
                            <Menu.Divider />
                        </>
                    )}
                    <Menu.Item
                        onClick={() => navigate({ to: "/settings/account" })}
                    >
                        Account &amp; settings
                    </Menu.Item>
                    {feedback.data?.enabled && (
                        <Menu.Item onClick={() => setFeedbackOpen(true)}>
                            Send feedback
                        </Menu.Item>
                    )}
                    {canLogOut && (
                        <Menu.Item
                            color="red"
                            onClick={() => void handleLogout()}
                        >
                            Log out
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
        </>
    );
};
