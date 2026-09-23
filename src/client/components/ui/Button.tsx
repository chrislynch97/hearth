import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "solid" | "outline" | "dashed" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    /** Leading glyph, drawn in the button's own text colour. */
    icon?: ReactNode;
    /** The 26px height used for actions sitting inside a card row. */
    compact?: boolean;
}

// `solid` is the one that commits (a form's submit); `outline` is the page-level
// add. Keeping the loud one for the end of a flow is why the top of a page no
// longer opens with a filled green button.
const VARIANTS: Record<ButtonVariant, string> = {
    solid: "border-transparent bg-primary font-semibold text-primary-fg hover:bg-primary-hover",
    outline:
        "border-border-strong bg-raised font-semibold text-primary hover:bg-hover",
    // A secondary add, beside or below the main one: clearly a button, but
    // quieter than `outline`.
    dashed: "border-dashed border-border-strong bg-transparent font-semibold text-primary hover:bg-hover",
    ghost: "border-transparent bg-transparent font-medium text-text-secondary hover:bg-hover",
    danger: "border-transparent bg-transparent font-semibold text-danger hover:bg-danger-tint",
};

export const Button = ({
    variant = "outline",
    icon,
    compact = false,
    type = "button",
    className = "",
    children,
    ...rest
}: ButtonProps) => (
    <button
        type={type}
        className={[
            "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border",
            "transition-colors duration-[140ms] ease-out",
            "disabled:pointer-events-none disabled:opacity-50",
            compact ? "h-[26px] px-2.5 text-xs" : "h-8 px-3.5 text-sm",
            VARIANTS[variant],
            className,
        ].join(" ")}
        {...rest}
    >
        {icon}
        {children}
    </button>
);
