import { useEffect, useId, useRef, useState } from "react";

export interface ActionMenuItem {
    label: string;
    onSelect: () => void;
    /** Drawn in the danger colour, for a delete. */
    danger?: boolean;
}

export interface ActionMenuProps {
    /** Names the button for assistive tech, e.g. "Actions for Wedding". */
    label: string;
    items: ActionMenuItem[];
}

/** A "⋯" button that opens a short list of actions on one thing. The actions
 *  that would clutter a form (archive, delete) live here instead. */
export const ActionMenu = ({ label, items }: ActionMenuProps) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const id = useId();

    // A tap or click anywhere else closes it; iOS never blurs on a tap elsewhere.
    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        menuRef.current
            ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
            ?.focus();
        return () => document.removeEventListener("pointerdown", closeOutside);
    }, [open]);

    const close = () => {
        setOpen(false);
        buttonRef.current?.focus();
    };

    const move = (step: number) => {
        const entries = [
            ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]'
            ) ?? []),
        ];
        const at = entries.indexOf(document.activeElement as HTMLButtonElement);
        entries[(at + step + entries.length) % entries.length]?.focus();
    };

    return (
        <div
            ref={rootRef}
            className="relative inline-flex"
            onKeyDown={(event) => {
                if (!open) return;
                if (event.key === "Escape") close();
                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    move(1);
                }
                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    move(-1);
                }
            }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setOpen(false);
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((value) => !value)}
                className="flex h-8 w-8 items-center justify-center rounded-sm text-lg leading-none text-text-secondary transition-colors duration-[140ms] ease-out hover:bg-hover"
            >
                ⋯
            </button>
            {open && (
                <div
                    ref={menuRef}
                    id={id}
                    role="menu"
                    aria-label={label}
                    className="absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col rounded-md border border-border bg-raised py-1 shadow-popover"
                >
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                item.onSelect();
                            }}
                            className={[
                                "px-3.5 py-2 text-left text-sm transition-colors duration-[140ms] ease-out hover:bg-hover focus-visible:bg-hover",
                                item.danger
                                    ? "font-semibold text-danger"
                                    : "text-text",
                            ].join(" ")}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
