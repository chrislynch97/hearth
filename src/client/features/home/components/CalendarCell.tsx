import type { CalendarEvent } from "@shared/calendar";
import { Button } from "@/components/ui/Button";
import { KIND_CHIP, KIND_COLOUR, isWeekend } from "@/features/home/calendar";

export interface CalendarCellProps {
    date: string;
    label: string;
    events: CalendarEvent[];
    today: boolean;
    past: boolean;
    selected: boolean;
    onSelect: () => void;
}

/** How many fit in a cell before the rest become "+2 more". */
const SHOWN = 3;

const shade = (date: string, today: boolean, selected: boolean): string => {
    if (selected)
        return "bg-primary-tint ring-2 ring-primary ring-inset hover:bg-primary-tint";
    if (today) return "bg-primary-tint-weak hover:bg-primary-tint";

    return isWeekend(date)
        ? "bg-surface hover:bg-hover"
        : "bg-raised hover:bg-hover";
};

/** One day: named chips from `lg` up, where they fit, and bars on anything narrower. */
export const CalendarCell = ({
    date,
    label,
    events,
    today,
    past,
    selected,
    onSelect,
}: CalendarCellProps) => {
    const hidden = events.length - SHOWN;

    return (
        <Button
            variant="ghost"
            aria-pressed={selected}
            aria-label={`${label}, ${events.length === 1 ? "1 thing" : `${events.length} things`}`}
            className={`relative h-16 min-w-0 flex-col items-stretch justify-start gap-1.5 rounded-none p-1 whitespace-normal focus-visible:z-10 lg:h-28 lg:p-1.5 ${shade(date, today, selected)}`}
            onClick={onSelect}
        >
            <span
                className={`tabular flex size-6 items-center justify-center self-start rounded-full text-sm leading-none ${
                    today
                        ? "bg-primary-fill font-semibold text-primary-fg"
                        : past
                          ? "text-text-faint"
                          : "font-medium text-text"
                }`}
            >
                {Number(date.slice(8, 10))}
            </span>
            <span
                className={`flex flex-col gap-0.5 px-0.5 lg:hidden ${past ? "opacity-50" : ""}`}
            >
                {events.slice(0, 4).map((event) => (
                    <span
                        key={event.id}
                        className={`h-1 rounded-full ${KIND_COLOUR[event.kind]}`}
                    />
                ))}
            </span>
            <span
                className={`flex min-w-0 flex-col gap-0.5 max-lg:hidden ${past ? "opacity-50" : ""}`}
            >
                {events.slice(0, SHOWN).map((event) => (
                    <span
                        key={event.id}
                        className={`truncate rounded-xs border-l-2 px-1 py-px text-left text-xs font-normal text-text ${KIND_CHIP[event.kind]}`}
                    >
                        {event.title}
                    </span>
                ))}
                {hidden > 0 && (
                    <span className="px-1 text-left text-xs font-normal text-text-muted">
                        +{hidden} more
                    </span>
                )}
            </span>
        </Button>
    );
};
