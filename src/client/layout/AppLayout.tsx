import { Outlet } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/shadcn/sidebar";
import { AppSidebar } from "@/layout/AppSidebar";
import { TopBar } from "@/layout/TopBar";
import { UpdateBanner } from "@/layout/UpdateBanner";
import { AccountEmailBanner } from "@/layout/AccountEmailBanner";

/** The app shell: top bar, sidebar, page. `--shell-header-height` sits the
 *  sidebar under the bar; `--shell-padding` is the page's gutter. */
export const AppLayout = () => (
    <SidebarProvider className="flex min-h-dvh flex-col bg-canvas [--shell-header-height:calc(52px+env(safe-area-inset-top))] [--shell-padding:16px] md:[--shell-padding:32px]">
        <TopBar />
        <div className="flex flex-1">
            {/* Under the sticky top bar rather than shadcn's default full height. */}
            <AppSidebar className="top-[var(--shell-header-height)] h-[calc(100dvh-var(--shell-header-height))]! pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]" />
            <main className="min-w-0 flex-1 p-[var(--shell-padding)] pb-[calc(var(--shell-padding)+env(safe-area-inset-bottom))]">
                <UpdateBanner />
                <AccountEmailBanner />
                <Outlet />
            </main>
        </div>
    </SidebarProvider>
);
