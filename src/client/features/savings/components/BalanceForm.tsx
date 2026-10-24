import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
} from "@/features/savings/model";

export interface BalanceFormProps {
    goalId: string;
    potName: string;
    today: string;
    /** What the plan thinks is in the pot today — a starting point to correct. */
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
    expected,
    onDone,
}: BalanceFormProps) => {
    const utils = trpc.useUtils();
    const record = trpc.savings.recordBalance.useMutation();
    const money = useMoney();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<BalanceFormValues>({
        defaultValues: {
            asOfDate: today,
            amount: moneyInput(expected, money.decimalPlaces),
            note: "",
        },
    });

    const submit = handleSubmit(async (values) => {
        try {
            await record.mutateAsync({
                goalId,
                asOfDate: values.asOfDate,
                amount: parseOptionalMoney(values.amount, money.decimalPlaces) ?? 0,
                note: values.note.trim() || null,
            });
        } catch {
            return;
        }
        await utils.savings.invalidate();
        notifySuccess(`Recorded the ${potName} pot's balance.`);
        onDone();
    });

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <div className="flex gap-2">
                    <TextField
                        label="In the pot"
                        description="From your banking app."
                        inputMode="decimal"
                        prefix={money.symbol}
                        className="flex-1"
                        error={errors.amount?.message}
                        autoFocus
                        {...register("amount", {
                            validate: (value) => validMoney(value, true),
                        })}
                    />
                    <TextField
                        label="On"
                        type="date"
                        max={today}
                        className="flex-1"
                        error={errors.asOfDate?.message}
                        {...register("asOfDate", {
                            validate: (value) =>
                                (value !== "" && value <= today) ||
                                "Pick today or a day before.",
                        })}
                    />
                </div>
                <TextField
                    label="Note"
                    placeholder="Optional, e.g. £2,000 from the bonus"
                    {...register("note")}
                />
                <p className="text-xs leading-snug text-text-muted">
                    A second balance on the same day replaces the first.
                </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    Record balance
                </Button>
            </div>
        </form>
    );
};
