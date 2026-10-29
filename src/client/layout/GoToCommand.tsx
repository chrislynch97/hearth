import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/shadcn/command";
import { NAV_SECTIONS, type AppRoutePath } from "@/layout/nav-config";
import { SoonBadge } from "@/components/ui/SoonBadge";

// A shortcut typed into a field is just text.
const isTyping = (el: Element | null) =>
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable);

/** The top bar's "Go to…": a field-shaped button (an icon on phones) opening a
 *  palette of every page, retired ones included. `/` or Ctrl/⌘+K from anywhere. */
export const GoToCommand = () => {
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const slash =
                e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
            const k = e.key === "k" && (e.metaKey || e.ctrlKey);
            if (!slash && !k) return;
            if (slash && isTyping(document.activeElement)) return;
            e.preventDefault();
            setOpen(true);
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const go = (to: AppRoutePath) => {
        setOpen(false);
        void navigate({ to });
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="hidden h-9 w-full max-w-[360px] items-center gap-2 rounded-md border border-border bg-sunken px-3 text-left text-text-muted transition-colors duration-[140ms] ease-out hover:border-border-strong hover:bg-hover md:flex"
            >
                <Search size={15} strokeWidth={1.5} className="shrink-0" />
                <span className="flex-1 text-base">Go to…</span>
                <kbd className="flex h-5 items-center rounded-xs border border-border px-1.5 font-mono text-[11px] text-text-faint">
                    /
                </kbd>
            </button>
            <button
                type="button"
                aria-label="Go to…"
                onClick={() => setOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary transition-colors duration-[140ms] ease-out hover:bg-hover md:hidden"
            >
                <Search size={19} strokeWidth={1.5} />
            </button>

            <CommandDialog
                open={open}
                onOpenChange={setOpen}
                title="Go to a page"
                description="Search every page in Hearth by name or section."
                // Near the top, not centred: on a phone the keyboard takes the
                // bottom half, and the list shouldn't jump as it filters.
                className="top-[max(1rem,env(safe-area-inset-top))] translate-y-0 sm:top-[12vh]"
            >
                <CommandInput placeholder="Go to…" />
                <CommandList>
                    <CommandEmpty>No matching page.</CommandEmpty>
                    {NAV_SECTIONS.map((section) => (
                        <CommandGroup key={section.id} heading={section.title}>
                            {section.groups.flatMap((group) =>
                                group.items.map((item) => (
                                    // The section and group ride along in the
                                    // value, so "upkeep" finds the whole group.
                                    <CommandItem
                                        key={item.to}
                                        value={`${item.label} ${section.title} ${group.title ?? ""}`}
                                        onSelect={() => go(item.to)}
                                    >
                                        <span className="flex-1">
                                            {item.label}
                                        </span>
                                        {group.title && (
                                            <span className="text-xs text-text-faint">
                                                {group.title}
                                            </span>
                                        )}
                                        {item.planned && <SoonBadge />}
                                    </CommandItem>
                                ))
                            )}
                        </CommandGroup>
                    ))}
                </CommandList>
            </CommandDialog>
        </>
    );
};
