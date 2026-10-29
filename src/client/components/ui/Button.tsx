import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "@/components/ui/buttonClass";

export type { ButtonVariant };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    /** Leading glyph, drawn in the button's own text colour. */
    icon?: ReactNode;
    /** The 26px height used for actions sitting inside a card row. */
    compact?: boolean;
}

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
        className={buttonClass({ variant, compact, className })}
        {...rest}
    >
        {icon}
        {children}
    </button>
);
