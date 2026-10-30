import type { ComponentProps, ReactNode } from "react";
import { Button as ShadcnButton } from "@/components/shadcn/button";

export type ButtonVariant =
    | "solid"
    | "outline"
    | "dashed"
    | "ghost"
    | "danger"
    | "danger-outline"
    | "destructive"
    | "attention"
    | "link";

export interface ButtonProps extends ComponentProps<"button"> {
    variant?: ButtonVariant;
    /** Leading glyph, drawn in the button's own text colour. */
    icon?: ReactNode;
    /** The 26px height used for actions sitting inside a card row. */
    compact?: boolean;
    /** Render the one child (a router `<Link>`, an `<a>`) as the button. The
     *  child brings its own icon. */
    asChild?: boolean;
}

/** shadcn's Button with Hearth's variants (see `components/shadcn/button`). */
export const Button = ({
    variant = "outline",
    icon,
    compact = false,
    asChild = false,
    type = "button",
    children,
    ...rest
}: ButtonProps) => (
    <ShadcnButton
        variant={variant}
        size={compact ? "compact" : "default"}
        asChild={asChild}
        type={asChild ? undefined : type}
        {...rest}
    >
        {asChild ? (
            children
        ) : (
            <>
                {icon}
                {children}
            </>
        )}
    </ShadcnButton>
);
