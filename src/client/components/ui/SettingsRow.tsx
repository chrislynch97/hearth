import type { ReactNode } from "react";

export interface SettingsRowProps {
    title: ReactNode;
    description?: ReactNode;
    /** Red title, for something that can't be undone. */
    danger?: boolean;
    /** The control: a switch, a button, a picker. Below the text on a phone. */
    children?: ReactNode;
    /** Keep the control beside the text on a phone too. */
    inline?: boolean;
}

/** A setting or an action: what it is on the left, the control on the right. */
export const SettingsRow = ({
    title,
    description,
    danger = false,
    children,
    inline = false,
}: SettingsRowProps) => (
    <div
        className={
            inline
                ? "flex items-center justify-between gap-6"
                : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        }
    >
        <div className="min-w-0">
            <h3
                className={`text-md font-semibold ${danger ? "text-danger" : "text-text"}`}
            >
                {title}
            </h3>
            {description && (
                <p className="mt-0.5 text-sm text-text-muted">{description}</p>
            )}
        </div>
        {children && (
            // Right-aligned under the text on a phone, like a dialog's buttons.
            <div
                className={`flex shrink-0 flex-wrap items-center justify-end gap-2 ${inline ? "" : "self-end sm:self-auto"}`}
            >
                {children}
            </div>
        )}
    </div>
);
