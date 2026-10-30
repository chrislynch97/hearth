import type { ReactNode } from "react";

export interface FieldGroupProps {
    label: string;
    children: ReactNode;
}

/** A caption over a control that labels itself for assistive tech, like a
 *  segmented control, so it reads the same as the fields around it. */
export const FieldGroup = ({ label, children }: FieldGroupProps) => (
    <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {children}
    </div>
);
