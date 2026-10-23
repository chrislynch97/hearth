import { useId, useState, type ReactNode } from "react";

export interface HoverDetailProps {
    /** What sits on the page; the detail hangs off it. */
    trigger: ReactNode;
    /** Accessible name for the trigger when its content isn't one on its own. */
    ariaLabel?: string;
    children: ReactNode;
}

/** Extra detail on hover, focus or tap. Tap toggles it because iOS won't focus
 *  a button on touch, so hover and focus alone never fire on a phone. */
export const HoverDetail = ({
    trigger,
    ariaLabel,
    children,
}: HoverDetailProps) => {
    const [open, setOpen] = useState(false);
    const id = useId();

    return (
        <span
            className="group relative inline-flex"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setOpen(false);
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
            }}
        >
            <button
                type="button"
                aria-label={ariaLabel}
                aria-describedby={id}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="rounded-xs underline decoration-border-strong decoration-dotted underline-offset-4"
            >
                {trigger}
            </button>
            <span
                id={id}
                role="tooltip"
                className={[
                    "absolute right-0 top-full z-20 mt-1.5 w-72 max-w-[calc(100vw-2rem)]",
                    "rounded-md border border-border bg-raised p-3 text-left shadow-popover",
                    "transition-opacity duration-[140ms] ease-out",
                    open
                        ? "visible opacity-100"
                        : "invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100",
                ].join(" ")}
            >
                {children}
            </span>
        </span>
    );
};
