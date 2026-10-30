import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { StatFigure } from "@/components/ui/StatFigure";
import {
    dueWithin,
    inMonth,
    monthName,
    monthOf,
    shiftMonth,
    totalOf,
    type Payment,
} from "../model";

export interface UpcomingSummaryProps {
    payments: Payment[];
    today: string;
    money: MoneyFormat;
}

const paymentCount = (payments: Payment[]) =>
    `${payments.length} ${payments.length === 1 ? "payment" : "payments"}`;

/** The three questions this page gets asked: this week, the rest of this month,
 *  and what's coming next. */
export const UpcomingSummary = ({
    payments,
    today,
    money,
}: UpcomingSummaryProps) => {
    const month = monthOf(today);
    const week = dueWithin(payments, today, 7);
    const rest = inMonth(payments, month);
    const next = inMonth(payments, shiftMonth(month, 1));

    return (
        <Card>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                    <StatFigure
                        label="Next 7 days"
                        value={formatMoney(totalOf(week), money)}
                        hint={paymentCount(week)}
                    />
                </div>
                <StatFigure
                    label="Rest of this month"
                    value={formatMoney(totalOf(rest), money)}
                    hint={paymentCount(rest)}
                />
                <StatFigure
                    label={monthName(
                        shiftMonth(month, 1),
                        money.locale
                    ).replace(/ \d+$/, "")}
                    value={formatMoney(totalOf(next), money)}
                    hint={paymentCount(next)}
                />
            </CardContent>
        </Card>
    );
};
