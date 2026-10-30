import { useState, type ReactNode } from "react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/shadcn/popover";

export interface HoverDetailProps {
    /** What sits on the page; the detail hangs off it. */
    trigger: ReactNode;
    /** Accessible name for the trigger when its content isn't one on its own. */
    ariaLabel?: string;
    children: ReactNode;
}

/** Extra detail on hover, or on tap where there's no hover: shadcn's Popover,
 *  opened by the pointer as well as a click. */
export const HoverDetail = ({
    trigger,
    ariaLabel,
    children,
}: HoverDetailProps) => {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                aria-label={ariaLabel}
                className="rounded-xs underline decoration-border-strong decoration-dotted underline-offset-4"
                onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setOpen(true);
                }}
                onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") setOpen(false);
                }}
            >
                {trigger}
            </PopoverTrigger>
            <PopoverContent
                align="end"
                collisionPadding={8}
                className="hearth-ds w-72 p-3"
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                {children}
            </PopoverContent>
        </Popover>
    );
};
