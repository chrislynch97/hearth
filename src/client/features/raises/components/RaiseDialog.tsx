import { useState, type KeyboardEvent } from "react";
import { todayIso } from "@shared/dates";
import { fromMinor, toMinor } from "@shared/money";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import type { Raise } from "../model";

export interface RaiseDialogProps {
    ownerId: string;
    /** Null adds a new raise. */
    raise: Raise | null;
    onClose: () => void;
    onDelete: (raise: Raise) => void;
}

/** One raise. Mounted per open, so the fields always start from the raise as it
 *  is now. */
export const RaiseDialog = ({
    ownerId,
    raise,
    onClose,
    onDelete,
}: RaiseDialogProps) => {
    const money = useMoney();
    const utils = trpc.useUtils();
    const create = trpc.raises.create.useMutation();
    const update = trpc.raises.update.useMutation();
    const [salary, setSalary] = useState(
        raise ? String(fromMinor(raise.newSalary, money.decimalPlaces)) : ""
    );
    const [effectiveDate, setEffectiveDate] = useState(
        raise?.effectiveDate ?? todayIso()
    );
    const [bonus, setBonus] = useState(
        raise?.bonus != null
            ? String(fromMinor(raise.bonus, money.decimalPlaces))
            : ""
    );
    const [position, setPosition] = useState(raise?.newPosition ?? "");
    const [note, setNote] = useState(raise?.note ?? "");
    const [error, setError] = useState("");

    const pending = create.isPending || update.isPending;

    const submit = async () => {
        if (!(Number(salary) > 0)) return setError("Enter the new salary.");
        if (!effectiveDate) return setError("Choose an effective date.");
        if (Number.isNaN(Number(bonus)))
            return setError("Enter the bonus as a number.");
        setError("");
        const fields = {
            effectiveDate,
            newSalary: toMinor(Number(salary), money.decimalPlaces),
            bonus:
                bonus === ""
                    ? null
                    : toMinor(Number(bonus), money.decimalPlaces),
            newPosition: position.trim() || undefined,
            note: note.trim() || undefined,
        };
        try {
            if (raise) {
                await update.mutateAsync({
                    id: raise.id,
                    expectedUpdatedAt: raise.updatedAt,
                    ...fields,
                });
            } else {
                await create.mutateAsync({ ownerId, ...fields });
            }
            await Promise.all([
                utils.raises.list.invalidate(),
                utils.income.overview.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save the raise."
            );
        }
    };

    const submitOnEnter = (e: KeyboardEvent) => {
        if (e.key === "Enter") void submit();
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={raise ? "Edit raise" : "Add raise"}
            confirm={{
                label: raise ? "Save" : "Add raise",
                onClick: () => void submit(),
                pending,
            }}
            aside={
                raise && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() => onDelete(raise)}
                    >
                        Delete
                    </Button>
                )
            }
        >
            <div className="grid grid-cols-2 gap-4">
                <TextField
                    label="Salary (annual)"
                    inputMode="decimal"
                    prefix={money.symbol}
                    placeholder="0.00"
                    value={salary}
                    onChange={(e) => setSalary(e.currentTarget.value)}
                    onKeyDown={submitOnEnter}
                />
                <TextField
                    label="Effective from"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.currentTarget.value)}
                    onKeyDown={submitOnEnter}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <TextField
                    label="Bonus (optional)"
                    inputMode="decimal"
                    prefix={money.symbol}
                    placeholder="0.00"
                    value={bonus}
                    onChange={(e) => setBonus(e.currentTarget.value)}
                    onKeyDown={submitOnEnter}
                />
                <TextField
                    label="Position (optional)"
                    placeholder="e.g. Senior Engineer"
                    value={position}
                    onChange={(e) => setPosition(e.currentTarget.value)}
                    onKeyDown={submitOnEnter}
                />
            </div>
            <TextField
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                onKeyDown={submitOnEnter}
            />
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
