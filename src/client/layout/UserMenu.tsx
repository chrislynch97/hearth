import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { hearthTokens } from "@/theme";
import { PersonAvatar } from "@/layout/PersonAvatar";
import { FeedbackModal } from "@/layout/FeedbackModal";

export const UserMenu = () => {
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
                        flex={1}
                        style={{ borderRadius: 8 }}
                        aria-label="Account menu"
                    >
                        <Group gap={8} wrap="nowrap">
                            <PersonAvatar name={name} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <Text
                                    size="sm"
                                    truncate
                                    style={{
                                        color: hearthTokens.brand.linen,
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {name}
                                </Text>
                                {active && (
                                    <Text
                                        size="xs"
                                        truncate
                                        style={{
                                            color: hearthTokens.brand.linen,
                                            opacity: 0.6,
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {active.householdName}
                                    </Text>
                                )}
                            </div>
                            <Text
                                size="xs"
                                style={{
                                    color: hearthTokens.brand.linen,
                                    opacity: 0.5,
                                }}
                            >
                                ⌄
                            </Text>
                        </Group>
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
