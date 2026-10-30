import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { HearthMark } from "@/components/HearthMark";
import { SidebarHeader, useSidebar } from "@/components/shadcn/sidebar";

/** The phone menu's top row: the same brand and height as the top bar it
 *  covers, with the close button where the menu button was. */
export const MobileMenuHeader = () => {
    const { setOpenMobile } = useSidebar();

    const close = () => setOpenMobile(false);

    return (
        <SidebarHeader className="hearth-ds h-[calc(52px+env(safe-area-inset-top))] flex-row items-center gap-3 border-b border-sidebar-border pt-[env(safe-area-inset-top)] pr-3 pl-2">
            <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="flex size-10 items-center justify-center rounded-md text-text-secondary transition-colors duration-[140ms] ease-out hover:bg-hover hover:text-text"
            >
                <X size={20} strokeWidth={1.75} />
            </button>
            <Link to="/" onClick={close} className="flex items-center gap-2">
                <HearthMark size={22} color="var(--color-primary)" />
                <span className="font-display text-h3 font-medium leading-none text-text">
                    Hearth
                </span>
            </Link>
        </SidebarHeader>
    );
};
