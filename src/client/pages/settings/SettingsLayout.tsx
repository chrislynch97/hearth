import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Stack, Tabs, Title } from "@mantine/core";
import { trpc } from "@/trpc";

type SettingsTab = "account" | "household" | "system";

/** Shared chrome for the settings sub-pages: a title + a tab bar that only shows
 *  the tabs the current user may use, with the active page's content below. */
export const SettingsLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const me = trpc.users.me.useQuery();
    const isInstanceOwner = me.data?.isInstanceOwner ?? false;

    // Which sub-route are we on? (…/settings/<tab>)
    const active = location.pathname.split("/")[2] ?? "account";

    return (
        <Stack gap="lg" maw={760} mx="auto">
            <Title order={2}>Settings</Title>
            <Tabs
                value={active}
                onChange={(v) =>
                    v && navigate({ to: `/settings/${v as SettingsTab}` })
                }
            >
                <Tabs.List>
                    <Tabs.Tab value="account">Account</Tabs.Tab>
                    <Tabs.Tab value="household">Household</Tabs.Tab>
                    {isInstanceOwner && (
                        <Tabs.Tab value="system">System</Tabs.Tab>
                    )}
                </Tabs.List>
            </Tabs>
            <Outlet />
        </Stack>
    );
};
