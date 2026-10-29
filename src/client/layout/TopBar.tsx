import { Link } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/shadcn/sidebar";
import { HearthMark } from "@/components/HearthMark";
import { GoToCommand } from "@/layout/GoToCommand";
import { ProfileLink } from "@/layout/ProfileLink";
import { ThemeToggle } from "@/layout/ThemeToggle";

/** Brand, search and account across the top. The trigger opens the phone menu,
 *  and on desktop hides or shows the sidebar. */
export const TopBar = () => (
    <header className="hearth-ds sticky top-0 z-30 flex h-[var(--shell-header-height)] shrink-0 items-center gap-3 border-b border-border bg-surface pt-[env(safe-area-inset-top)] pr-[max(12px,env(safe-area-inset-right))] pl-[max(8px,env(safe-area-inset-left))] md:gap-4">
        <SidebarTrigger
            aria-label="Open menu"
            className="size-10 text-text-secondary hover:bg-hover md:size-8"
        />
        {/* As wide as the sidebar under it, less the bar's padding, trigger and
            gaps, so the field lines up with the page content. */}
        <Link
            to="/"
            className="mr-auto flex shrink-0 items-center gap-2 md:mr-0 md:w-[188px]"
        >
            <HearthMark size={22} color="var(--color-primary)" />
            <span className="font-display text-h3 font-medium leading-none text-text">
                Hearth
            </span>
        </Link>
        <GoToCommand />
        <div className="flex shrink-0 items-center gap-1 md:ml-auto">
            <ThemeToggle />
            <ProfileLink />
        </div>
    </header>
);
