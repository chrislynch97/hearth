import { formatMoney, formatMoneyCompact } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { dayName, totalOf, type Payment } from "../model";

export interface CalendarDayProps {
    date: string;
    payments: Payment[];
    /** Takes a big share of the month, so it's the day to plan around. */
    big: boolean;
    today: boolean;
    past: boolean;
    selected: boolean;
    money: MoneyFormat;
    onSelect: () => void;
}

/** One day of the month. A day with payments shows what goes out, compactly, as
 *  the cell is barely wider than the figure on a phone. */
export const CalendarDay = ({
    date,
    payments,
    big,
    today,
    past,
    selected,
    money,
    onSelect,
}: CalendarDayProps) => {
    const total = totalOf(payments);
    const has = payments.length > 0;
    const tone = selected
        ? "border-primary bg-primary-tint hover:bg-primary-tint"
        : big
          ? "border-attention/50 bg-attention-tint hover:bg-attention-tint"
          : has
            ? "bg-primary-tint hover:bg-primary-tint"
            : "";

    return (
        <Button
            variant="ghost"
            disabled={!has}
            aria-pressed={selected}
            aria-label={
                has
                    ? `${dayName(date, money.locale)}, ${formatMoney(total, money)}, ${payments.length} ${payments.length === 1 ? "payment" : "payments"}`
                    : dayName(date, money.locale)
            }
            className={`h-13 flex-col items-start justify-between gap-0 border border-transparent px-0.5 py-1.5 disabled:opacity-100 sm:h-16 sm:p-2 ${tone} ${past ? "opacity-40 disabled:opacity-40" : ""}`}
            onClick={onSelect}
        >
            <span
                className={`pl-0.5 text-sm leading-none sm:pl-0 ${today ? "flex size-5 items-center justify-center rounded-full bg-primary-fill font-semibold text-primary-fg" : "text-text-secondary"}`}
            >
                {Number(date.slice(8, 10))}
            </span>
            {has && (
                <span className="tabular w-full pl-0.5 text-left text-xs font-semibold leading-none text-text sm:pl-0 sm:text-sm">
                    {formatMoneyCompact(total, money)}
                </span>
            )}
        </Button>
    );
};
