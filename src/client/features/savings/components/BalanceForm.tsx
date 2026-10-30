import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
} from "@/features/savings/model";
import type { SavingsBalance } from "../../../../server/db/schema";

export interface BalanceFormProps {
    goalId: string;
    potName: string;
    today: string;
    /** Absent when recording a new one. */
    balance: SavingsBalance | undefined;
    /** What the plan thinks is in the pot today — a new entry's starting point. */
    expected: number;
    onDone: () => void;
}

interface BalanceFormValues {
    asOfDate: string;
    amount: string;
    note: string;
}

export const BalanceForm = ({
    goalId,
    potName,
    today,
    balance,
    expected,
    onDone,
}: BalanceFormProps) => {
    const utils = trpc.useUtils();
    const record = trpc.savings.recordBalance.useMutation();
    const update = trpc.savings.updateBalance.useMutation();
    const remove = trpc.savings.removeBalance.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<BalanceFormValues>({
        defaultValues: {
            asOfDate: balance?.asOfDate ?? today,
            amount: moneyInput(balance?.amount ?? expected, money.decimalPlaces),
            note: balance?.note ?? "",
        },
    });

    const submit = handleSubmit(async (values) => {
        const fields = {
            asOfDate: values.asOfDate,
            amount: parseOptionalMoney(values.amount, money.decimalPlaces) ?? 0,
            note: values.note.trim() || null,
        };
        try {
            if (balance) {
                await update.mutateAsync({
                    id: balance.id,
                    expectedUpdatedAt: balance.updatedAt,
                    ...fields,
                });
            } else {
                await record.mutateAsync({ goalId, ...fields });
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.savings.invalidate();
        notifySuccess(
            balance
                ? `Saved the ${formatDate(fields.asOfDate)} balance.`
                : `Recorded the ${potName} pot's balance.`
        );
        onDone();
    });

    const handleRemove = async () => {
        if (!balance) return;
        try {
            await remove.mutateAsync({ id: balance.id });
        } catch {
            return;
        }
        await utils.savings.invalidate();
        notifySuccess(`Deleted the ${formatDate(balance.asOfDate)} balance.`);
        onDone();
    };

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="In the pot"
                    description="From your banking app."
                    inputMode="decimal"
                    prefix={money.symbol}
                    error={errors.amount?.message}
                    autoFocus
                    {...register("amount", {
                        validate: (value) => validMoney(value, true),
                    })}
                />
                <TextField
                    label="On"
                    description={
                        balance
                            ? undefined
                            : "A second balance on the same day replaces the first."
                    }
                    type="date"
                    max={today}
                    error={errors.asOfDate?.message}
                    {...register("asOfDate", {
                        validate: (value) =>
                            (value !== "" && value <= today) ||
                            "Pick today or a day before.",
                    })}
                />
                <TextField
                    label="Note"
                    placeholder="Optional, e.g. £2,000 from the bonus"
                    {...register("note")}
                />
            </div>

            <div className="mt-5 flex justify-end">
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {balance ? "Save changes" : "Record balance"}
                </Button>
            </div>

            {balance && (
                <ArchiveAction
                    label="Delete balance"
                    consequence="Takes this reading out of the history and the plan. This can't be undone."
                    pending={remove.isPending}
                    onArchive={() => void handleRemove()}
                />
            )}
        </form>
    );
};
