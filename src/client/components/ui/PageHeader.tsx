import type { ReactNode } from "react";

export interface PageHeaderProps {
    title: ReactNode;
    /** A line under the title. */
    description?: ReactNode;
    /** Buttons on the right; below the title on a phone. */
    actions?: ReactNode;
}

/** The title row every page opens with. */
export const PageHeader = ({
    title,
    description,
    actions,
}: PageHeaderProps) => (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
            <h1 className="font-display text-h1 font-medium leading-tight text-text">
                {title}
            </h1>
            {description && (
                <p className="mt-1 text-md text-text-muted">{description}</p>
            )}
        </div>
        {actions && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {actions}
            </div>
        )}
    </header>
);
