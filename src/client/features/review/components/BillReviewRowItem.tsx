import { formatMoney } from "@shared/money";
import { formatSignedPercent, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import type { BillReviewRow } from "../../../../server/features/budget/billReview";

export interface BillReviewRowItemProps {
    row: BillReviewRow;
    money: MoneyFormat;
}

/** `+£24.00` / `-£12.00` — formatMoney already leads a negative with its own `-`. */
const signedMoney = (minor: number, money: MoneyFormat): string =>
    `${minor > 0 ? "+" : ""}${formatMoney(minor, money)}`;

/** One bill: what it costs now, and how far it has moved in a year. */
export const BillReviewRowItem = ({ row, money }: BillReviewRowItemProps) => {
    const changed = row.changeAnnual !== 0;
    const tone = row.changeAnnual > 0 ? "text-danger" : "text-positive-fg";
    const creeping =
        row.riseCount >= 2 &&
        row.creepPct !== null &&
        row.firstObserved !== null;

    return (
        <li className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col gap-0.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-text">
                    {row.name}
                    {row.recurrence !== "monthly" && (
                        <Badge variant="secondary" className="capitalize">
                            {row.recurrence}
                        </Badge>
                    )}
                    {row.source === "actual" && (
                        <Badge
                            variant="tint"
                            title="Based on what you actually paid, not the recorded bill amount"
                        >
                            From payments
                        </Badge>
                    )}
                </p>
                <p className="text-sm text-text-muted">
                    {formatMoney(row.currentMonthly, money)}/mo
                </p>
                {creeping && (
                    <p className="text-sm text-attention-fg">
                        Risen {row.riseCount}× ·{" "}
                        {formatSignedPercent(row.creepPct! * 100, 0)} since{" "}
                        {row.firstObserved!.slice(0, 4)}
                    </p>
                )}
            </div>
            {changed ? (
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={`tabular text-base font-semibold ${tone}`}>
                        {signedMoney(row.changeAnnual, money)}/yr
                    </span>
                    {row.changePct !== null && (
                        <span className={`tabular text-sm ${tone}`}>
                            {formatSignedPercent(row.changePct * 100)}
                        </span>
                    )}
                </div>
            ) : (
                <span className="shrink-0 text-sm text-text-muted">
                    {row.hasHistory ? "No change" : "No history yet"}
                </span>
            )}
        </li>
    );
};
