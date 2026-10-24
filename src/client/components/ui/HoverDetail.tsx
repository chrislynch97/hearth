import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
    // A second click or Escape has to beat hover and focus, which would
    // otherwise keep it up; cleared once the pointer or focus comes back.
    const [dismissed, setDismissed] = useState(false);
    const rootRef = useRef<HTMLSpanElement>(null);
    const id = useId();

    // iOS never blurs on a tap elsewhere, so listen for one.
    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        return () => document.removeEventListener("pointerdown", closeOutside);
    }, [open]);

    const dismiss = () => {
        setOpen(false);
        setDismissed(true);
    };

    const visibility = dismissed
        ? "invisible opacity-0"
        : open
          ? "visible opacity-100"
          : "invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100";

    return (
        <span
            ref={rootRef}
            className="group relative inline-flex"
            onMouseEnter={() => setDismissed(false)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false);
                    setDismissed(false);
                }
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") dismiss();
            }}
        >
            <button
                type="button"
                aria-label={ariaLabel}
                aria-describedby={id}
                aria-expanded={open}
                onClick={() => {
                    if (open) {
                        dismiss();
                    } else {
                        setOpen(true);
                        setDismissed(false);
                    }
                }}
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
                    visibility,
                ].join(" ")}
            >
                {children}
            </span>
        </span>
    );
};
