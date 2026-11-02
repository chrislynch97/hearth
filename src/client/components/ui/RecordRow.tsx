import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface RecordRowProps {
    title: ReactNode;
    /** A muted line under the title. */
    details?: ReactNode;
    /** The figure on the right: a date, an amount. */
    value: ReactNode;
    /** A line under the figure. */
    meta?: ReactNode;
    /** A quick action inside the row, in place of its chevron. */
    action?: ReactNode;
    onClick: () => void;
}

/** One record with a figure on the right. The whole row opens it; its action
 *  sits inside the row, raised above the stretched tap target so both work. */
export const RecordRow = ({
    title,
    details,
    value,
    meta,
    action,
    onClick,
}: RecordRowProps) => (
    <li className="relative flex items-center gap-3 rounded-sm px-2.5 py-2.5 transition-colors duration-[140ms] ease-out hover:bg-hover">
        <button
            type="button"
            className="min-w-0 flex-1 rounded-sm text-left outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
            onClick={onClick}
        >
            <span className="block truncate text-base font-medium text-text">
                {title}
            </span>
            {details && (
                <span className="block truncate text-sm text-text-muted">
                    {details}
                </span>
            )}
        </button>
        <span className="pointer-events-none flex shrink-0 flex-col items-end gap-0.5">
            <span className="tabular text-base font-medium text-text">
                {value}
            </span>
            {meta}
        </span>
        {action ? (
            <span className="relative z-10 shrink-0">{action}</span>
        ) : (
            <ChevronRight className="pointer-events-none size-4 shrink-0 text-text-faint" />
        )}
    </li>
);
