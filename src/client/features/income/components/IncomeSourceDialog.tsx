import { useState } from "react";
import { fromMinor, toMinor } from "@shared/money";
import type { Recurrence } from "@shared/recurrence";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { RECURRENCES, type IncomeSource } from "../model";

export interface IncomeSourceDialogProps {
    /** Null adds a new source. */
    source: IncomeSource | null;
    members: Array<{ id: string; displayName: string }>;
    onClose: () => void;
}

/** One income that isn't a payslip. Mounted per open, so the fields always start
 *  from the source as it is now. */
export const IncomeSourceDialog = ({
    source,
    members,
    onClose,
}: IncomeSourceDialogProps) => {
    const money = useMoney();
    const utils = trpc.useUtils();
    const create = trpc.incomeSources.create.useMutation();
    const update = trpc.incomeSources.update.useMutation();
    const archive = trpc.incomeSources.archive.useMutation();
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [name, setName] = useState(source?.name ?? "");
    const [amount, setAmount] = useState(
        source
            ? fromMinor(source.amount, money.decimalPlaces).toFixed(
                  money.decimalPlaces
              )
            : ""
    );
    const [recurrence, setRecurrence] = useState(
        (source?.recurrence ?? "monthly") as Recurrence
    );
    const [gross, setGross] = useState(source?.basis === "gross");
    const [error, setError] = useState("");

    const pending = create.isPending || update.isPending || archive.isPending;

    const run = async (action: () => Promise<unknown>) => {
        setError("");
        try {
            await action();
            await Promise.all([
                utils.incomeSources.list.invalidate(),
                utils.income.overview.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save that.");
        }
    };

    const submit = () => {
        if (!source && !ownerId)
            return setError("Choose whose income this is.");
        if (!name.trim()) return setError("Enter a name.");
        if (!(Number(amount) > 0)) return setError("Enter an amount.");
        const fields = {
            name: name.trim(),
            amount: toMinor(Number(amount), money.decimalPlaces),
            recurrence,
            basis: gross ? ("gross" as const) : ("net" as const),
        };
        void run(() =>
            source
                ? update.mutateAsync({
                      id: source.id,
                      expectedUpdatedAt: source.updatedAt,
                      ...fields,
                  })
                : create.mutateAsync({ ownerId: ownerId ?? "", ...fields })
        );
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={source ? `Edit ${source.name}` : "Add income"}
            confirm={{
                label: source ? "Save" : "Add income",
                onClick: submit,
                pending,
            }}
            aside={
                source && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() =>
                            void run(() =>
                                archive.mutateAsync({ id: source.id })
                            )
                        }
                    >
                        Archive
                    </Button>
                )
            }
        >
            <TextField
                label="Name"
                placeholder="e.g. Rental income"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {!source && (
                <ChoiceField
                    label="Whose"
                    placeholder="Choose someone"
                    options={members.map((m) => ({
                        value: m.id,
                        label: m.displayName,
                    }))}
                    value={ownerId}
                    onChange={setOwnerId}
                />
            )}
            <div className="grid grid-cols-2 gap-4">
                <TextField
                    label="Amount"
                    inputMode="decimal"
                    prefix={money.symbol}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <ChoiceField
                    label="How often"
                    options={RECURRENCES}
                    value={recurrence}
                    onChange={setRecurrence}
                />
            </div>
            <CheckboxField
                checked={gross}
                onCheckedChange={setGross}
                label="This amount is before tax"
                description="Gross income isn't spendable, so it's recorded but not counted in your monthly income."
            />
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
