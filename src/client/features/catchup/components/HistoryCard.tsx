import { useState } from "react";
import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { batchSummary } from "../model";

const RECENT = 5;

export interface HistoryCardProps {
    members: Array<{ id: string; displayName: string }>;
    money: MoneyFormat;
}

/** What's been ticked off, newest first, and the way back if one was a mistake.
 *  Only the latest few show until asked: the list only ever grows. */
export const HistoryCard = ({ members, money }: HistoryCardProps) => {
    const utils = trpc.useUtils();
    const formatDate = useFormatDate();
    const batchesQuery = trpc.reconcile.batches.useQuery();
    const potsQuery = trpc.pots.list.useQuery();
    const undo = trpc.reconcile.undoBatch.useMutation();
    const [showAll, setShowAll] = useState(false);

    const batches = batchesQuery.data ?? [];
    const pots = potsQuery.data ?? [];
    const shown = showAll ? batches : batches.slice(0, RECENT);

    const runUndo = async (batchId: string) => {
        await undo.mutateAsync({ batchId });
        await Promise.all([
            utils.reconcile.backlog.invalidate(),
            utils.reconcile.batches.invalidate(),
            utils.spends.list.invalidate(),
        ]);
    };

    if (batches.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col divide-y divide-border">
                    {shown.map((batch) => {
                        const summary = batchSummary(batch);
                        const moved = Math.abs(batch.movedAmount ?? 0);
                        const potName = batch.potId
                            ? (pots.find((p) => p.id === batch.potId)?.name ??
                              "Unknown pot")
                            : "Mixed";
                        const recipient = members.find(
                            (m) => m.id === batch.ownerId
                        )?.displayName;
                        const figure = summary.isWriteOff
                            ? `Wrote off ${formatMoney(moved, money)}`
                            : summary.isResidualPayment
                              ? `Paid down ${formatMoney(moved, money)}`
                              : summary.isPartial
                                ? `${formatMoney(moved, money)} of ${formatMoney(Math.abs(batch.totalAmount), money)}`
                                : formatMoney(
                                      Math.abs(batch.totalAmount),
                                      money
                                  );
                        return (
                            <li
                                key={batch.id}
                                className={`flex items-center gap-3 py-2 ${summary.isReversed ? "opacity-60" : ""}`}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-base font-medium text-text">
                                        {potName}
                                        {recipient && ` → ${recipient}`}
                                    </p>
                                    <p className="text-sm text-text-muted">
                                        {formatDate(
                                            batch.createdAt
                                                .toISOString()
                                                .slice(0, 10)
                                        )}
                                    </p>
                                </div>
                                <span className="tabular shrink-0 text-base text-text">
                                    {figure}
                                </span>
                                {summary.isReversed ? (
                                    <Badge variant="secondary">Undone</Badge>
                                ) : (
                                    <Button
                                        compact
                                        variant="ghost"
                                        disabled={undo.isPending}
                                        aria-label={`Undo ${potName}`}
                                        onClick={() => void runUndo(batch.id)}
                                    >
                                        Undo
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {undo.error && (
                    <Notice tone="danger" title={undo.error.message} />
                )}
                {batches.length > RECENT && (
                    <Button
                        variant="link"
                        className="self-start text-sm"
                        onClick={() => setShowAll((all) => !all)}
                    >
                        {showAll ? "Show fewer" : `Show all ${batches.length}`}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};
