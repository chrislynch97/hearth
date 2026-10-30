import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogOutButton } from "./LogOutButton";

type SettingsTab = "account" | "household" | "system";

/** Shared chrome for the settings sub-pages: the title, and a tab per scope
 *  the current user may use — each tab is a route, so it survives a refresh
 *  and can be linked to. */
export const SettingsLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const me = trpc.users.me.useQuery();

    const isInstanceOwner = me.data?.isInstanceOwner ?? false;
    // Which sub-route are we on? (…/settings/<tab>)
    const active = location.pathname.split("/")[2] ?? "account";

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-6">
            <PageHeader title="Settings" actions={<LogOutButton />} />
            <Tabs
                value={active}
                onValueChange={(tab) =>
                    void navigate({ to: `/settings/${tab as SettingsTab}` })
                }
            >
                <TabsList
                    variant="line"
                    className="h-auto w-full justify-start gap-4 border-b border-border p-0"
                >
                    <TabsTrigger value="account" className={TAB}>
                        Account
                    </TabsTrigger>
                    <TabsTrigger value="household" className={TAB}>
                        Household
                    </TabsTrigger>
                    {isInstanceOwner && (
                        <TabsTrigger value="system" className={TAB}>
                            System
                        </TabsTrigger>
                    )}
                </TabsList>
            </Tabs>
            <Outlet />
        </div>
    );
};

const TAB =
    "flex-none rounded-sm border-0 px-0.5 pb-2.5 text-md shadow-none focus-visible:outline-none data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-text dark:data-[state=active]:bg-transparent after:bg-primary group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]";
