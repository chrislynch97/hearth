import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

// Filled buttons sit up off the page: a lit top edge and a soft shadow, so the
// fill reads as a control rather than a flat swatch.
const RAISED =
    "border border-black/10 font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.22)] active:shadow-none";

// Hearth's variants on shadcn's Button. `solid` (alias `default`) is the one
// that commits — a form's submit; `outline` is the page-level add. Keeping the
// loud one for the end of a flow is why a page doesn't open with a green block.
const buttonVariants = cva(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm whitespace-nowrap transition-[color,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
        variants: {
            variant: {
                default: `${RAISED} bg-primary-fill text-primary-fg hover:bg-primary-fill-hover`,
                solid: `${RAISED} bg-primary-fill text-primary-fg hover:bg-primary-fill-hover`,
                outline:
                    "border border-border-strong bg-raised font-semibold text-primary shadow-xs hover:bg-hover",
                // A secondary add, beside or below the main one: clearly a button, but
                // quieter than `outline`.
                dashed: "border border-dashed border-border-strong bg-transparent font-semibold text-primary hover:bg-hover",
                ghost: "font-medium text-text-secondary hover:bg-hover hover:text-text",
                secondary: "bg-secondary font-medium text-text hover:bg-hover",
                // Red words, no fill: the opener for something that can't be undone.
                danger: "font-semibold text-danger hover:bg-danger-tint",
                // Clearly a red action, for one beside other buttons where `destructive`'s
                // fill would compete with the Save it sits next to.
                "danger-outline":
                    "border border-danger bg-danger-tint font-semibold text-danger shadow-xs hover:bg-danger hover:text-bg",
                // The confirming press in a dialog for something that can't be undone.
                destructive: `${RAISED} bg-danger text-bg hover:bg-danger-hover`,
                // The one action a "needs you" notice asks for — apricot, never a
                // second primary.
                attention: `${RAISED} bg-attention text-attention-ink hover:brightness-105`,
                link: "h-auto! px-0! font-semibold text-primary underline-offset-4 hover:underline",
            },
            size: {
                default: "h-8 px-3.5 text-base",
                // For actions sitting inside a card row.
                compact: "h-[26px] gap-1.5 px-2.5 text-xs",
                sm: "h-8 gap-1.5 px-3 text-sm",
                lg: "h-10 px-6 text-md",
                icon: "size-9",
                "icon-sm": "size-8",
                "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

function Button({
    className,
    variant = "default",
    size = "default",
    asChild = false,
    ...props
}: React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
    }) {
    const Comp = asChild ? Slot.Root : "button";

    return (
        <Comp
            data-slot="button"
            data-variant={variant}
            data-size={size}
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { Button, buttonVariants };
