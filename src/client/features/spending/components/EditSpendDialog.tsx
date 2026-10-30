import { useState } from "react";
import { formatMoney, fromMinor } from "@shared/money";
import { trpc } from "@/trpc";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { StatRow } from "@/components/ui/StatRow";
import {
    draftAmount,
    draftError,
    type Member,
    type Pot,
    type Spend,
    type SpendDraft,
} from "../model";
import { SpendFields } from "./SpendFields";

export interface EditSpendDialogProps {
    spend: Spend;
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    onClose: () => void;
    onSplit: () => void;
    onDelete: () => void;
}

/** One spend. Once it's reconciled there's nothing here to change, so it just
 *  shows what was logged, with Catch-up as the way back. */
export const EditSpendDialog = ({
    spend,
    members,
    pots,
    money,
    onClose,
    onSplit,
    onDelete,
}: EditSpendDialogProps) => {
    const utils = trpc.useUtils();
    const formatDate = useFormatDate();
    const update = trpc.spends.update.useMutation();
    const categories = trpc.categories.list.useQuery().data ?? [];
    const [draft, setDraft] = useState<SpendDraft>({
        amount: fromMinor(Math.abs(spend.amount), money.decimalPlaces).toFixed(
            money.decimalPlaces
        ),
        refund: spend.amount < 0,
        description: spend.description,
        date: spend.date,
        ownerId: spend.ownerId,
        funding: {
            potId: spend.potId,
            categoryId: spend.categoryId,
            settledAtSource: spend.settledAtSource === 1,
        },
    });
    const [error, setError] = useState("");

    const deleteButton = (
        <Button
            variant="danger-outline"
            disabled={update.isPending}
            onClick={onDelete}
        >
            Delete
        </Button>
    );

    if (spend.reconciled === 1) {
        return (
            <ConfirmDialog
                open
                onOpenChange={(open) => !open && onClose()}
                title={spend.description}
                aside={deleteButton}
            >
                <div className="flex flex-col gap-1">
                    <StatRow
                        label="Amount"
                        value={formatMoney(Math.abs(spend.amount), money)}
                    />
                    <StatRow label="Date" value={formatDate(spend.date)} />
                    <StatRow
                        label="Paid by"
                        value={
                            members.find((m) => m.id === spend.ownerId)
                                ?.displayName ?? "Someone"
                        }
                    />
                    <StatRow
                        label="Pot"
                        value={
                            pots.find((p) => p.id === spend.potId)?.name ??
                            "Main account"
                        }
                    />
                </div>
                <p className="text-sm text-text-muted">
                    It&apos;s been reconciled, so it can&apos;t be edited. Undo
                    it in Catch-up&apos;s history to change it.
                </p>
            </ConfirmDialog>
        );
    }

    const submit = async () => {
        const invalid = draftError(draft);
        if (invalid) return setError(invalid);
        setError("");
        const { potId, categoryId, settledAtSource } = draft.funding;
        try {
            await update.mutateAsync({
                id: spend.id,
                expectedUpdatedAt: spend.updatedAt,
                date: draft.date || undefined,
                description: draft.description.trim(),
                amount: draftAmount(draft, money.decimalPlaces),
                ownerId: draft.ownerId ?? spend.ownerId,
                potId,
                categoryId: potId ? null : categoryId,
                settledAtSource,
            });
            await Promise.all([
                utils.spends.list.invalidate(),
                utils.spends.lastByOwner.invalidate(),
                utils.reconcile.backlog.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save that.");
        }
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title="Edit spend"
            confirm={{
                label: "Save",
                onClick: () => void submit(),
                pending: update.isPending,
            }}
            secondary={{ label: "Split", onClick: onSplit }}
            aside={deleteButton}
        >
            <SpendFields
                draft={draft}
                onChange={(patch) =>
                    setDraft((current) => ({ ...current, ...patch }))
                }
                onSubmit={() => void submit()}
                members={members}
                pots={pots}
                categories={categories}
                money={money}
            />
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
