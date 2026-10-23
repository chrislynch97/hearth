import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import type { PotBalance } from "@/features/plan/model";

export interface ShouldHoldProps {
    balance: PotBalance;
    money: MoneyFormat;
}

/** What the pot ought to have in it on the chosen day, opening into the share
 *  each bill has built up. Bills only: a set-aside is never spent on a date, so
 *  there is nothing for it to be on track for. */
export const ShouldHold = ({ balance, money }: ShouldHoldProps) => {
    const formatDate = useFormatDate();

    return (
        <details className="group border-b border-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2 transition-colors duration-[140ms] ease-out hover:bg-hover [&::-webkit-details-marker]:hidden">
                <ChevronIcon className="text-text-faint transition-transform duration-[140ms] group-open:rotate-90" />
                <span className="flex-1 text-sm text-text-secondary">
                    Should hold
                </span>
                <span className="tabular text-sm font-semibold text-text">
                    {formatMoney(balance.total, money)}
                </span>
            </summary>
            <ul className="px-3.5 pb-2.5 pt-0.5">
                {balance.lines.map((line) => (
                    <li
                        key={line.expenseId}
                        className="flex items-baseline gap-2 py-1 pl-5"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-text-secondary">
                                {line.name}
                            </span>
                            <span className="block text-xs text-text-faint">
                                {line.nextDue
                                    ? `${formatMoney(line.amount, money)} due ${formatDate(line.nextDue)}`
                                    : "No due date — add one to count it"}
                            </span>
                        </span>
                        <span className="tabular shrink-0 text-sm text-text">
                            {line.nextDue
                                ? formatMoney(line.accrued, money)
                                : "—"}
                        </span>
                    </li>
                ))}
            </ul>
        </details>
    );
};
