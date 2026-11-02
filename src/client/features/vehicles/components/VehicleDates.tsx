import { CalendarClock } from "lucide-react";
import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { DueBadge } from "@/components/ui/DueBadge";
import { dueStatus } from "@/lib/due";
import { RecordRow } from "@/components/ui/RecordRow";
import { IconSection } from "@/components/ui/IconSection";
import { type VehicleDateRow } from "@/features/vehicles/model";
import { repeatLabel } from "@shared/schedule";

export interface VehicleDatesProps {
    dates: VehicleDateRow[];
    today: string;
    /** Absent on an archived vehicle, which takes no new dates. */
    onAdd?: () => void;
    onEdit: (date: VehicleDateRow) => void;
    onDone: (date: VehicleDateRow) => void;
}

const reminderLabel = (days: number): string =>
    days === 0 ? "reminder on the day" : `${days}-day reminder`;

/** MOT, insurance and the rest, soonest first, each with a way to tick it off. */
export const VehicleDates = ({
    dates,
    today,
    onAdd,
    onEdit,
    onDone,
}: VehicleDatesProps) => {
    const formatDate = useFormatDate();

    return (
        <IconSection
            title="Dates"
            icon={<CalendarClock />}
            action={
                onAdd && (
                    <Button
                        icon={<PlusIcon />}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={onAdd}
                    >
                        Add date
                    </Button>
                )
            }
        >
            {dates.length === 0 ? (
                <p className="px-2 py-2.5 text-base text-text-muted">
                    Add the MOT, insurance renewal and service, and you’ll get
                    a nudge before each one.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-border">
                    {dates.map((date) => (
                        <RecordRow
                            key={date.id}
                            title={date.name}
                            details={`${repeatLabel(date.repeatMonths)} · ${reminderLabel(date.remindDays)}`}
                            value={formatDate(date.dueDate)}
                            meta={
                                dueStatus(date.dueDate, today) !== "later" && (
                                    <DueBadge
                                        dueDate={date.dueDate}
                                        today={today}
                                        formatted={formatDate(date.dueDate)}
                                    />
                                )
                            }
                            onClick={() => onEdit(date)}
                            action={
                                <Button
                                    compact
                                    className="shrink-0"
                                    onClick={() => onDone(date)}
                                >
                                    Done
                                </Button>
                            }
                        />
                    ))}
                </ul>
            )}
        </IconSection>
    );
};
