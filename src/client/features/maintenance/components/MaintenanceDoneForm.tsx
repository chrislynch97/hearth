import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextField } from "@/components/ui/TextField";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
} from "@/features/gifts/model";
import type {
    MaintenanceJobWithLog,
    MaintenanceLogRow,
} from "@/features/maintenance/model";
import { todayIso } from "@shared/dates";
import { addRepeat, type RepeatUnit } from "@shared/schedule";

export interface MaintenanceDoneFormProps {
    job: MaintenanceJobWithLog;
    /** Set when correcting a past entry rather than ticking the job off. */
    entry?: MaintenanceLogRow;
    persons: Array<{ id: string; displayName: string }>;
    onDone: () => void;
}

interface MaintenanceDoneFormValues {
    doneOn: string;
    doneById: string;
    amount: string;
    note: string;
}

/** Ticks a job off — when, by whom, what it cost — and moves it on; or, given
 *  an entry, corrects that entry in place. */
export const MaintenanceDoneForm = ({
    job,
    entry,
    persons,
    onDone,
}: MaintenanceDoneFormProps) => {
    const utils = trpc.useUtils();
    const done = trpc.maintenance.done.useMutation();
    const update = trpc.maintenance.logs.update.useMutation();
    const remove = trpc.maintenance.logs.remove.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<MaintenanceDoneFormValues>({
        defaultValues: {
            doneOn: entry?.doneOn ?? todayIso(),
            doneById: entry?.doneById ?? job.assigneeId ?? "",
            amount: moneyInput(entry?.amount ?? null, money.decimalPlaces),
            note: entry?.note ?? "",
        },
    });
    const doneOn = useWatch({ control, name: "doneOn" });

    const submit = handleSubmit(async (values) => {
        const fields = {
            doneOn: values.doneOn,
            doneById: values.doneById || null,
            amount: parseOptionalMoney(values.amount, money.decimalPlaces),
            note: values.note.trim() || null,
        };
        try {
            if (entry) {
                await update.mutateAsync({ id: entry.id, ...fields });
            } else {
                await done.mutateAsync({
                    id: job.id,
                    expectedUpdatedAt: job.updatedAt,
                    ...fields,
                });
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.maintenance.invalidate();
        notifySuccess(entry ? "Saved." : `${job.name} done.`);
        onDone();
    });

    const deleteEntry = async () => {
        if (!entry) return;
        try {
            await remove.mutateAsync({ id: entry.id });
        } catch {
            return;
        }
        await utils.maintenance.invalidate();
        notifySuccess("Entry deleted.");
        onDone();
    };

    const next =
        job.repeatEvery !== null && doneOn
            ? addRepeat(doneOn, job.repeatEvery, job.repeatUnit as RepeatUnit)
            : null;
    const doerOptions = persons.map((person) => ({
        value: person.id,
        label: person.displayName,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextField
                        label="Done on"
                        type="date"
                        error={errors.doneOn?.message}
                        {...register("doneOn", {
                            required: "When was it done?",
                        })}
                    />
                    <FormChoiceField
                        control={control}
                        name="doneById"
                        label="Done by"
                        emptyLabel="Someone else"
                        options={doerOptions}
                    />
                </div>
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
                <TextField
                    label="Note"
                    placeholder="e.g. Replaced the pressure valve"
                    {...register("note")}
                />
                {!entry && (
                    <p className="text-sm text-text-muted">
                        {next
                            ? `Next due ${formatDate(next)}.`
                            : "It’s a one-off, so it’s archived once done."}
                    </p>
                )}
            </div>

            <FormFooter
                aside={
                    entry && (
                        <ArchiveAction
                            label="Delete entry"
                            consequence="Removes this from the job’s history. The due date stays where it is."
                            pending={remove.isPending}
                            onArchive={() => void deleteEntry()}
                        />
                    )
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {entry ? "Save changes" : "Mark done"}
                </Button>
            </FormFooter>
        </form>
    );
};
