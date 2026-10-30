import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { backlogToMove } from "@/features/catchup/model";
import type { DashboardSummary } from "@/features/home/model";

export interface BacklogHeadlineProps {
    backlog: DashboardSummary["backlog"];
    money: MoneyFormat;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Whether there's spending to reconcile — a Catch up when there is, a quiet
 *  all-clear when there isn't. */
export const BacklogHeadline = ({ backlog, money }: BacklogHeadlineProps) => {
    const { transfers, total } = backlogToMove(backlog.perPot);
    const needsPot = backlog.unassigned.count;

    if (transfers === 0 && needsPot === 0) {
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
                transfers > 0
                    ? `${plural(transfers, "transfer")} to make`
                    : "Spending to sort"
            }
            action={
                <Button variant="attention" asChild>
                    <Link to="/catchup">Catch up</Link>
                </Button>
            }
        >
            {transfers > 0
                ? `Move ${formatMoney(Math.abs(total), money)}`
                : "Nothing to move yet"}
            {needsPot > 0 ? ` · ${needsPot} need a pot` : ""}
        </Notice>
    );
};
