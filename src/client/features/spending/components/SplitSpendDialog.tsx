import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { allocate, formatMoney, fromMinor, toMinor } from "@shared/money";
import { groupedPotOptions, orderMembers } from "@/potOptions";
import { trpc } from "@/trpc";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import type { Member, Pot, Spend } from "../model";

interface SplitPart {
    key: number;
    amount: string;
    ownerId: string;
    potId: string | null;
}

export interface SplitSpendDialogProps {
    spend: Spend;
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    onClose: () => void;
}

/** Divides one spend across people and pots. Starts as an even two-way split, so
 *  the parts begin balanced. */
export const SplitSpendDialog = ({
    spend,
    members,
    pots,
    money,
    onClose,
}: SplitSpendDialogProps) => {
    const utils = trpc.useUtils();
    const split = trpc.spends.split.useMutation();
    const dp = money.decimalPlaces;
    const total = Math.abs(spend.amount);
    const major = (minor: number) => fromMinor(minor, dp).toFixed(dp);
    const [parts, setParts] = useState<SplitPart[]>(() =>
        allocate(total, [1, 1]).map((amount, key) => ({
            key,
            amount: major(amount),
            ownerId: spend.ownerId,
            potId: spend.potId,
        }))
    );
    const [error, setError] = useState("");

    const minors = parts.map((p) => {
        const value = Number(p.amount);
        return p.amount && Number.isFinite(value) ? toMinor(value, dp) : 0;
    });
    const remaining = total - minors.reduce((sum, m) => sum + m, 0);
    const balanced = remaining === 0 && minors.every((m) => m > 0);
    const owners = orderMembers(members).map((m) => ({
        value: m.id,
        label: m.displayName,
    }));

    const change = (key: number, patch: Partial<SplitPart>) =>
        setParts((current) =>
            current.map((p) => (p.key === key ? { ...p, ...patch } : p))
        );

    const addPart = () =>
        setParts((current) => [
            ...current,
            {
                key: Math.max(...current.map((p) => p.key)) + 1,
                amount: "",
                ownerId: spend.ownerId,
                potId: null,
            },
        ]);

    const splitEvenly = () => {
        const amounts = allocate(
            total,
            parts.map(() => 1)
        );
        setParts((current) =>
            current.map((p, i) => ({ ...p, amount: major(amounts[i] ?? 0) }))
        );
    };

    const submit = async () => {
        setError("");
        const sign = spend.amount < 0 ? -1 : 1;
        try {
            await split.mutateAsync({
                id: spend.id,
                parts: parts.map((p, i) => ({
                    amount: sign * (minors[i] ?? 0),
                    ownerId: p.ownerId,
                    potId: p.potId,
                })),
            });
            await Promise.all([
                utils.spends.list.invalidate(),
                utils.reconcile.backlog.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not split that.");
        }
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={`Split ${spend.description}`}
            description={`Divide ${formatMoney(total, money)} across people and pots.`}
            confirm={{
                label: "Save split",
                onClick: () => void submit(),
                pending: split.isPending,
                disabled: !balanced,
            }}
        >
            <ul className="flex flex-col divide-y divide-border">
                {parts.map((part, i) => (
                    <li
                        key={part.key}
                        className="flex flex-col gap-3 py-3 first:pt-0"
                    >
                        <div className="flex items-end gap-2">
                            <TextField
                                label="Amount"
                                inputMode="decimal"
                                prefix={money.symbol}
                                placeholder="0.00"
                                value={part.amount}
                                onChange={(e) =>
                                    change(part.key, {
                                        amount: e.currentTarget.value,
                                    })
                                }
                                className="min-w-0 flex-1"
                            />
                            <ChoiceField
                                label="Who paid"
                                options={owners}
                                value={part.ownerId}
                                onChange={(ownerId) =>
                                    change(part.key, { ownerId })
                                }
                                className="min-w-0 flex-1"
                            />
                            {parts.length > 2 && (
                                <Button
                                    variant="ghost"
                                    className="size-9 px-0 text-text-muted hover:text-danger"
                                    aria-label={`Remove part ${i + 1}`}
                                    icon={<Trash2 />}
                                    onClick={() =>
                                        setParts((current) =>
                                            current.filter(
                                                (p) => p.key !== part.key
                                            )
                                        )
                                    }
                                />
                            )}
                        </div>
                        <Combobox
                            label="Pot"
                            placeholder="Assign later"
                            clearLabel="Assign later"
                            options={groupedPotOptions(pots, members)}
                            value={part.potId}
                            onChange={(potId) => change(part.key, { potId })}
                        />
                    </li>
                ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
                <Button compact icon={<Plus />} onClick={addPart}>
                    Add part
                </Button>
                <Button compact onClick={splitEvenly}>
                    Split evenly
                </Button>
                <span
                    className={`tabular ml-auto text-base font-semibold ${balanced ? "text-positive-fg" : "text-danger"}`}
                >
                    {balanced
                        ? "Balanced"
                        : remaining === 0
                          ? "A part has no amount"
                          : remaining > 0
                            ? `${formatMoney(remaining, money)} left`
                            : `${formatMoney(-remaining, money)} over`}
                </span>
            </div>
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
