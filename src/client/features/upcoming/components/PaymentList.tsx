import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { dayName, dueLabel, totalOf, type Payment } from "../model";

export interface PaymentListProps {
    title: string;
    payments: Payment[];
    money: MoneyFormat;
    /** Offered while narrowed to one day. */
    onShowAll?: () => void;
}

/** The payments behind the calendar, in date order. */
export const PaymentList = ({
    title,
    payments,
    money,
    onShowAll,
}: PaymentListProps) => (
    <Card>
        <CardHeader className="flex items-baseline justify-between gap-3">
            <CardTitle>{title}</CardTitle>
            <span className="tabular text-md font-semibold text-text">
                {formatMoney(totalOf(payments), money)}
            </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
            {payments.length === 0 ? (
                <p className="text-base text-text-muted">
                    Nothing left to pay this month.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-border">
                    {payments.map((payment) => (
                        <li
                            key={`${payment.expenseId}-${payment.date}`}
                            className="flex items-center gap-3 py-2"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-medium text-text">
                                    {payment.name}
                                </p>
                                <p className="text-sm text-text-muted">
                                    {dayName(payment.date, money.locale)}
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                                <span className="tabular text-base font-medium text-text">
                                    {formatMoney(payment.amount, money)}
                                </span>
                                {payment.dueSoon ? (
                                    <Badge variant="attention">
                                        {dueLabel(payment.daysUntil)}
                                    </Badge>
                                ) : (
                                    <span className="text-sm text-text-muted">
                                        {dueLabel(payment.daysUntil)}
                                    </span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {onShowAll && (
                <Button
                    variant="link"
                    className="self-start text-sm"
                    onClick={onShowAll}
                >
                    Show the whole month
                </Button>
            )}
        </CardContent>
    </Card>
);
