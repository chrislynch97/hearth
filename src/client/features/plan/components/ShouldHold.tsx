import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { HoverDetail } from "@/components/ui/HoverDetail";
import type { PotBalance } from "@/features/plan/model";

export interface ShouldHoldProps {
    balance: PotBalance;
    money: MoneyFormat;
}

/** What the pot ought to have in it on the chosen day, with each bill's share
 *  on hover. Bills only: a set-aside is never spent on a date, so there is
 *  nothing for it to be on track for. */
export const ShouldHold = ({ balance, money }: ShouldHoldProps) => {
    const formatDate = useFormatDate();

    const total = formatMoney(balance.total, money);

    return (
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
            <span className="flex-1 text-sm text-text-secondary">
                Should hold
            </span>
            <HoverDetail
                ariaLabel={`Should hold ${total}, by bill`}
                trigger={
                    <span className="tabular text-sm font-semibold text-text">
                        {total}
                    </span>
                }
            >
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {balance.lines.map((line) => (
                        <li
                            key={line.expenseId}
                            className="flex items-baseline gap-2"
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
            </HoverDetail>
        </div>
    );
};
