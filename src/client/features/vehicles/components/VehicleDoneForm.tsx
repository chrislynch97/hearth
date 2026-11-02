import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextField } from "@/components/ui/TextField";
import { parseOptionalMoney, validMoney } from "@/features/gifts/model";
import type { VehicleDateRow } from "@/features/vehicles/model";
import { todayIso } from "@shared/dates";
import { nextDueDate } from "@shared/vehicles";

export interface VehicleDoneFormProps {
    date: VehicleDateRow;
    onDone: () => void;
}

interface VehicleDoneFormValues {
    doneOn: string;
    amount: string;
    note: string;
}

/** Ticks off an MOT or a renewal: logs what it cost and moves the date on. */
export const VehicleDoneForm = ({ date, onDone }: VehicleDoneFormProps) => {
    const utils = trpc.useUtils();
    const done = trpc.vehicles.dates.done.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<VehicleDoneFormValues>({
        defaultValues: { doneOn: todayIso(), amount: "", note: "" },
    });
    const doneOn = useWatch({ control, name: "doneOn" });

    const submit = handleSubmit(async (values) => {
        try {
            await done.mutateAsync({
                id: date.id,
                expectedUpdatedAt: date.updatedAt,
                doneOn: values.doneOn,
                amount: parseOptionalMoney(values.amount, money.decimalPlaces),
                note: values.note.trim() || null,
            });
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.vehicles.invalidate();
        notifySuccess(`${date.name} done.`);
        onDone();
    });

    const next =
        date.repeatMonths !== null && doneOn
            ? nextDueDate(date.dueDate, doneOn, date.repeatMonths)
            : null;

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextField
                        label="Done on"
                        type="date"
                        error={errors.doneOn?.message}
                        {...register("doneOn", { required: "When was it done?" })}
                    />
                    <TextField
                        label="What it cost"
                        placeholder="Optional"
                        inputMode="decimal"
                        prefix={money.symbol}
                        error={errors.amount?.message}
                        {...register("amount", {
                            validate: (value) => validMoney(value, false),
                        })}
                    />
                </div>
                <TextField
                    label="Note"
                    placeholder="e.g. Passed, two advisories"
                    {...register("note")}
                />
                <p className="text-sm text-text-muted">
                    {next
                        ? `Next due ${formatDate(next)}.`
                        : "It’s a one-off, so it comes off the list."}
                </p>
            </div>

            <FormFooter>
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    Mark done
                </Button>
            </FormFooter>
        </form>
    );
};
