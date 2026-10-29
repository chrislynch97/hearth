export type ButtonVariant =
    "solid" | "outline" | "dashed" | "ghost" | "danger" | "attention";

// Filled buttons sit up off the page: a lit top edge and a soft shadow, so the
// fill reads as a control rather than a flat swatch.
const RAISED =
    "border-black/10 font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.22)] active:shadow-none";

// `solid` is the one that commits (a form's submit); `outline` is the page-level
// add. Keeping the loud one for the end of a flow is why the top of a page no
// longer opens with a filled green button.
const VARIANTS: Record<ButtonVariant, string> = {
    solid: `${RAISED} bg-primary-fill text-primary-fg hover:bg-primary-fill-hover`,
    outline:
        "border-border-strong bg-raised font-semibold text-primary hover:bg-hover",
    // A secondary add, beside or below the main one: clearly a button, but
    // quieter than `outline`.
    dashed: "border-dashed border-border-strong bg-transparent font-semibold text-primary hover:bg-hover",
    ghost: "border-transparent bg-transparent font-medium text-text-secondary hover:bg-hover",
    danger: "border-transparent bg-transparent font-semibold text-danger hover:bg-danger-tint",
    // The one action a "needs you" banner asks for — apricot, never a second primary.
    attention: `${RAISED} bg-attention text-attention-ink hover:brightness-105`,
};

/** A button's classes, for a link that should look like one (`<Link
 *  className={buttonClass({ variant: "solid" })}>`). */
export const buttonClass = ({
    variant = "outline",
    compact = false,
    className = "",
}: {
    variant?: ButtonVariant;
    compact?: boolean;
    className?: string;
} = {}) =>
    [
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border",
        "transition-colors duration-[140ms] ease-out",
        "disabled:pointer-events-none disabled:opacity-50",
        compact ? "h-[26px] px-2.5 text-xs" : "h-8 px-3.5 text-base",
        VARIANTS[variant],
        className,
    ].join(" ");
