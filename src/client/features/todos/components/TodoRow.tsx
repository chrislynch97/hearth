import { Bell, Flag } from "lucide-react";
import { useFormatDate } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Button } from "@/components/ui/Button";
import { DueBadge } from "@/features/todos/components/DueBadge";
import { TodoDate } from "@/features/todos/components/TodoDate";
import { dueStatus, type TodoWithDetails } from "@/features/todos/model";

export interface TodoRowProps {
    todo: TodoWithDetails;
    /** Resolved by the page, so a row does no lookups of its own. */
    assigneeName: string | null;
    /** Only when the page is showing more than one list. */
    listName: string | null;
    /** Left empty when the row above already gives the date. */
    showDate: boolean;
    today: string;
    pending: boolean;
    onToggle: () => void;
    onEdit: () => void;
}

/** One line of the diary: the date in the margin, tick it beside the rule, tap
 *  the rest to open it. */
export const TodoRow = ({
    todo,
    assigneeName,
    listName,
    showDate,
    today,
    pending,
    onToggle,
    onEdit,
}: TodoRowProps) => {
    const formatDate = useFormatDate();

    const done = todo.completedAt !== null;
    const status = todo.dueDate ? dueStatus(todo.dueDate, today) : null;
    const overdue = !done && status === "overdue";
    const waiting = todo.reminders.filter((r) => r.sentAt === null).length;
    const details = [listName, assigneeName].filter(Boolean);

    return (
        <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] sm:grid-cols-[3.25rem_minmax(0,1fr)]">
            <div className="pt-2.5 pr-2.5 sm:pr-3.5">
                {showDate && todo.dueDate && (
                    <TodoDate date={todo.dueDate} overdue={overdue} />
                )}
            </div>
            <div
                className={`flex items-start gap-1.5 border-l-2 pl-2.5 sm:pl-3.5 ${overdue ? "border-danger" : "border-border"}`}
            >
                <Checkbox
                    checked={done}
                    disabled={pending}
                    aria-label={`Done: ${todo.title}`}
                    onCheckedChange={onToggle}
                    className="mt-3 size-5 sm:size-4"
                />
                <Button
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 justify-between gap-3 px-2 py-2.5 text-left font-normal whitespace-normal"
                    onClick={onEdit}
                >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span
                            className={
                                done
                                    ? "text-md text-text-faint line-through"
                                    : "text-md font-medium text-text"
                            }
                        >
                            {todo.title}
                        </span>
                        {details.length > 0 && (
                            <span className="flex flex-wrap gap-x-3 text-sm text-text-muted">
                                {details.map((detail) => (
                                    <span key={detail}>{detail}</span>
                                ))}
                            </span>
                        )}
                        {todo.tags.length > 0 && (
                            <span className="flex flex-wrap gap-1">
                                {todo.tags.map((tag) => (
                                    <Badge key={tag} variant="tint">
                                        {tag}
                                    </Badge>
                                ))}
                            </span>
                        )}
                    </span>
                    {!done && (
                        <span className="flex shrink-0 items-center gap-1.5">
                            {todo.priority === "high" && (
                                <Flag
                                    role="img"
                                    aria-label="High priority"
                                    className="text-attention-fg"
                                />
                            )}
                            {waiting > 0 && (
                                <Bell
                                    role="img"
                                    aria-label={
                                        waiting === 1
                                            ? "1 reminder set"
                                            : `${waiting} reminders set`
                                    }
                                    className="text-text-faint"
                                />
                            )}
                            {todo.dueDate && status !== "later" && (
                                <DueBadge
                                    dueDate={todo.dueDate}
                                    today={today}
                                    formatted={formatDate(todo.dueDate)}
                                />
                            )}
                        </span>
                    )}
                </Button>
            </div>
        </li>
    );
};
