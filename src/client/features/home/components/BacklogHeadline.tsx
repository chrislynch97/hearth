import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { DashboardSummary } from "@/features/home/model";

export interface BacklogHeadlineProps {
    backlog: DashboardSummary["backlog"];
    money: MoneyFormat;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Whether there's spending to reconcile — a Catch up when there is, a quiet
 *  all-clear when there isn't. */
export const BacklogHeadline = ({ backlog, money }: BacklogHeadlineProps) => {
    const toReconcile = backlog.perPot.length;
    const needsPot = backlog.unassigned.count;

    if (toReconcile === 0 && needsPot === 0) {
        return (
            <Notice tone="positive" title="You're all caught up">
                No spending waiting to be reconciled.
            </Notice>
        );
    }

    return (
        <Notice
            tone="attention"
            title={
                toReconcile > 0
                    ? `${plural(toReconcile, "pot")} to reconcile`
                    : "Spending to sort"
            }
            action={
                <Button variant="attention" asChild>
                    <Link to="/catchup">Catch up</Link>
                </Button>
            }
        >
            Move {formatMoney(Math.abs(backlog.grandTotal), money)} between pots
            {needsPot > 0 ? ` · ${needsPot} need a pot` : ""}
        </Notice>
    );
};
