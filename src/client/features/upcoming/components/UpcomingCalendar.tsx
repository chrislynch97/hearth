import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFirstDayOfWeek, type MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import {
    monthCells,
    monthName,
    monthOf,
    totalOf,
    weekdayNames,
    type Payment,
} from "../model";
import { CalendarDay } from "./CalendarDay";

// A day this share of the month's total is one to plan around.
const BIG_DAY_SHARE = 0.25;

export interface UpcomingCalendarProps {
    month: string;
    /** This month's payments. */
    payments: Payment[];
    today: string;
    lastMonth: string;
    selected: string | null;
    money: MoneyFormat;
    onMonth: (delta: number) => void;
    onSelect: (date: string | null) => void;
}

/** A month at a glance: which days money leaves, how much, and which are big. */
export const UpcomingCalendar = ({
    month,
    payments,
    today,
    lastMonth,
    selected,
    money,
    onMonth,
    onSelect,
}: UpcomingCalendarProps) => {
    const firstDay = useFirstDayOfWeek();

    const monthTotal = totalOf(payments);

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-2">
                <CardTitle>{monthName(month, money.locale)}</CardTitle>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        className="size-9 px-0 sm:size-8"
                        aria-label="Previous month"
                        icon={<ChevronLeft />}
                        disabled={month <= monthOf(today)}
                        onClick={() => onMonth(-1)}
                    />
                    <Button
                        variant="ghost"
                        className="size-9 px-0 sm:size-8"
                        aria-label="Next month"
                        icon={<ChevronRight />}
                        disabled={month >= lastMonth}
                        onClick={() => onMonth(1)}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-7 gap-1">
                    {weekdayNames(firstDay, money.locale).map((name) => (
                        <span
                            key={name}
                            className="pb-1 text-center text-sm font-medium text-text-muted"
                        >
                            {name}
                        </span>
                    ))}
                    {monthCells(month, firstDay).map((date, i) => {
                        if (!date) return <span key={`blank-${i}`} />;
                        const onDay = payments.filter((p) => p.date === date);
                        return (
                            <CalendarDay
                                key={date}
                                date={date}
                                payments={onDay}
                                big={
                                    totalOf(onDay) >=
                                        monthTotal * BIG_DAY_SHARE &&
                                    onDay.length > 0
                                }
                                today={date === today}
                                past={date < today}
                                selected={date === selected}
                                money={money}
                                onSelect={() =>
                                    onSelect(date === selected ? null : date)
                                }
                            />
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};
