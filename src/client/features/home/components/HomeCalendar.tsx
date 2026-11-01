import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CALENDAR_KINDS, type CalendarKind } from "@shared/calendar";
import { todayIso } from "@shared/dates";
import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { useFirstDayOfWeek, useMoney } from "@/useMoney";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/FilterChip";
import {
    KIND_CHIP,
    KIND_COLOUR,
    KIND_LABEL,
    eventsByDate,
    loadHiddenKinds,
    monthSummary,
    saveHiddenKinds,
} from "@/features/home/calendar";
import { CalendarAgenda } from "@/features/home/components/CalendarAgenda";
import { CalendarCell } from "@/features/home/components/CalendarCell";
import {
    dayName,
    monthCells,
    monthName,
    monthOf,
    shiftMonth,
    weekdayNames,
} from "@/features/upcoming/model";

/** Everything in the house with a date on it, a month at a time. */
export const HomeCalendar = () => {
    const money = useMoney();
    const firstDay = useFirstDayOfWeek();
    const today = todayIso();

    const [month, setMonth] = useState(monthOf(today));
    const [selected, setSelected] = useState(today);
    const [hidden, setHidden] = useState<CalendarKind[]>(loadHiddenKinds);

    const days = monthCells(month, firstDay);
    // Blanks to the end of the last week, or the grid's backing shows through.
    const cells = [
        ...days,
        ...new Array<null>((7 - (days.length % 7)) % 7).fill(null),
    ];
    const dates = days.filter((date) => date !== null);
    const query = trpc.dashboard.calendar.useQuery(
        { from: dates[0] ?? today, to: dates.at(-1) ?? today },
        { placeholderData: keepPreviousData }
    );
    const shown = useMemo(
        () => (query.data ?? []).filter((e) => !hidden.includes(e.kind)),
        [query.data, hidden]
    );
    const byDate = useMemo(() => eventsByDate(shown), [shown]);

    const toggleKind = (kind: CalendarKind) => {
        const next = hidden.includes(kind)
            ? hidden.filter((k) => k !== kind)
            : [...hidden, kind];
        setHidden(next);
        saveHiddenKinds(next);
    };

    const goToMonth = (next: string) => {
        setMonth(next);
        setSelected(next === monthOf(today) ? today : `${next}-01`);
    };

    return (
        <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="flex w-full items-start justify-between gap-4 sm:w-auto">
                    <div className="flex min-w-0 flex-col gap-1">
                        <CardTitle className="font-display text-h2 font-medium">
                            {monthName(month, money.locale)}
                        </CardTitle>
                        <CardDescription>
                            {monthSummary(shown, (amount) =>
                                formatMoney(amount, money)
                            )}
                        </CardDescription>
                    </div>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            className="size-9 px-0 sm:size-8"
                            aria-label="Previous month"
                            icon={<ChevronLeft />}
                            onClick={() => goToMonth(shiftMonth(month, -1))}
                        />
                        <Button
                            variant="ghost"
                            className="size-9 px-0 sm:size-8"
                            aria-label="Next month"
                            icon={<ChevronRight />}
                            onClick={() => goToMonth(shiftMonth(month, 1))}
                        />
                    </div>
                </div>
                <div
                    role="group"
                    aria-label="Show on the calendar"
                    className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto"
                >
                    {CALENDAR_KINDS.map((kind) => (
                        <FilterChip
                            key={kind}
                            active={!hidden.includes(kind)}
                            variant="outline"
                            className={
                                hidden.includes(kind)
                                    ? "text-text-muted"
                                    : `text-text ${KIND_CHIP[kind]}`
                            }
                            onClick={() => toggleKind(kind)}
                        >
                            <span
                                className={`size-2 rounded-full ${hidden.includes(kind) ? "bg-border-strong" : KIND_COLOUR[kind]}`}
                            />
                            {KIND_LABEL[kind]}
                        </FilterChip>
                    ))}
                </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="grid min-w-0 grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
                    {weekdayNames(firstDay, money.locale).map((name) => (
                        <span
                            key={name}
                            className="bg-sunken py-1.5 text-center text-sm font-medium text-text-secondary"
                        >
                            {name}
                        </span>
                    ))}
                    {cells.map((date, i) =>
                        date ? (
                            <CalendarCell
                                key={date}
                                date={date}
                                label={dayName(date, money.locale)}
                                events={byDate.get(date) ?? []}
                                today={date === today}
                                past={date < today}
                                selected={date === selected}
                                onSelect={() => setSelected(date)}
                            />
                        ) : (
                            <span key={`blank-${i}`} className="bg-sunken" />
                        )
                    )}
                </div>
                <div className="relative min-w-0">
                    <CalendarAgenda
                        date={selected}
                        today={selected === today}
                        events={byDate.get(selected) ?? []}
                        money={money}
                    />
                </div>
            </CardContent>
        </Card>
    );
};
