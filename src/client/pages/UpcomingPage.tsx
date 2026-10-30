import { useState } from "react";
import { todayIso } from "@shared/dates";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { PaymentList } from "@/features/upcoming/components/PaymentList";
import { UpcomingCalendar } from "@/features/upcoming/components/UpcomingCalendar";
import { UpcomingSummary } from "@/features/upcoming/components/UpcomingSummary";
import {
    dayName,
    inMonth,
    monthName,
    monthOf,
    shiftMonth,
} from "@/features/upcoming/model";

// A year out covers everything but the rarest bills, and the query is cheap.
const HORIZON_DAYS = 365;
const MONTHS_AHEAD = 11;

/** When money is about to leave: the next few weeks in figures, and a calendar
 *  for seeing where in the month the big days fall. */
export const UpcomingPage = () => {
    const money = useMoney();
    const query = trpc.plan.upcoming.useQuery({ horizonDays: HORIZON_DAYS });
    const today = todayIso();
    const [chosenMonth, setChosenMonth] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);

    const payments = query.data?.payments ?? [];
    // Opens on the first month with something in it, not a month that's over.
    const month = chosenMonth ?? monthOf(payments[0]?.date ?? today);
    const thisMonth = inMonth(payments, month);
    const shown = selected
        ? thisMonth.filter((p) => p.date === selected)
        : thisMonth;

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader title="Upcoming" />
            {query.isLoading && <Spinner label="Loading upcoming payments" />}
            {query.data && payments.length === 0 && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        Nothing due in the next year. Add a due date to a bill
                        on the Plan to see it here.
                    </CardContent>
                </Card>
            )}
            {payments.length > 0 && (
                <>
                    <UpcomingSummary
                        payments={payments}
                        today={today}
                        money={money}
                    />
                    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                        <UpcomingCalendar
                            month={month}
                            payments={thisMonth}
                            today={today}
                            lastMonth={shiftMonth(monthOf(today), MONTHS_AHEAD)}
                            selected={selected}
                            money={money}
                            onMonth={(delta) => {
                                setChosenMonth(shiftMonth(month, delta));
                                setSelected(null);
                            }}
                            onSelect={setSelected}
                        />
                        <PaymentList
                            title={
                                selected
                                    ? dayName(selected, money.locale)
                                    : monthName(month, money.locale)
                            }
                            payments={shown}
                            money={money}
                            onShowAll={
                                selected ? () => setSelected(null) : undefined
                            }
                        />
                    </div>
                </>
            )}
        </div>
    );
};
