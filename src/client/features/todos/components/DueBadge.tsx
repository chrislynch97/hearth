import { Badge } from "@/components/shadcn/badge";
import { dueLabel, dueStatus, type DueStatus } from "@/features/todos/model";

export interface DueBadgeProps {
    dueDate: string;
    today: string;
    /** The household's own formatting, for dates too far out to word. */
    formatted: string;
}

const VARIANT: Record<DueStatus, "danger" | "attention" | "tint" | "outline"> = {
    overdue: "danger",
    today: "attention",
    soon: "tint",
    later: "outline",
};

/** A deadline in words, louder the closer it is. */
export const DueBadge = ({ dueDate, today, formatted }: DueBadgeProps) => (
    <Badge
        variant={VARIANT[dueStatus(dueDate, today)]}
        className="tabular text-xs"
    >
        {dueLabel(dueDate, today, formatted)}
    </Badge>
);
