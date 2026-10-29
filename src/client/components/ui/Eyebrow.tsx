import type { ReactNode } from "react";

export interface EyebrowProps {
    children: ReactNode;
    className?: string;
}

/** The small label over a figure or a group of figures ("Net worth", a
 *  person's name over their numbers). */
export const Eyebrow = ({ children, className = "" }: EyebrowProps) => (
    <p className={`text-sm font-medium text-text-muted ${className}`}>
        {children}
    </p>
);
