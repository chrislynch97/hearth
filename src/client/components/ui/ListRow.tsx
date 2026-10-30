import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ListRowProps {
    title: ReactNode;
    /** What it is, in a muted line under the title. */
    details?: ReactNode;
    /** The figure on the right, if the record has one. */
    value?: ReactNode;
    /** A line under the figure: a date, a change, a badge. */
    meta?: ReactNode;
    onClick: () => void;
}

/** One record in a list, the whole row its only tap target, so a phone never
 *  has to hit small buttons and everything else lives behind the tap. */
export const ListRow = ({
    title,
    details,
    value,
    meta,
    onClick,
}: ListRowProps) => (
    <li>
        <Button
            variant="ghost"
            className="h-auto w-full justify-between gap-3 whitespace-normal px-2 py-2.5 text-left font-normal"
            onClick={onClick}
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-text">
                    {title}
                </span>
                {details && (
                    <span className="block truncate text-sm text-text-muted">
                        {details}
                    </span>
                )}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="tabular text-base font-medium text-text">
                    {value}
                </span>
                {meta}
            </span>
            <ChevronRight className="text-text-faint" />
        </Button>
    </li>
);
