import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import {
    AREA_OPTIONS,
    parseRepeat,
    repeatOptionsFor,
    repeatValue,
    type MaintenanceJobWithLog,
} from "@/features/maintenance/model";
import { todayIso } from "@shared/dates";
import {
    DEFAULT_MAINTENANCE_REMIND_DAYS,
    type MaintenanceArea,
} from "@shared/maintenance";
import { MAX_REMIND_DAYS } from "@shared/schedule";

export interface MaintenanceJobFormProps {
    /** Absent when adding. */
    job: MaintenanceJobWithLog | undefined;
    persons: Array<{ id: string; displayName: string }>;
    /** Push is set up on this server, so a reminder can actually go out. */
    canRemind: boolean;
    onDone: () => void;
}

interface MaintenanceJobFormValues {
    name: string;
    area: MaintenanceArea;
    dueDate: string;
    repeat: string;
    assigneeId: string;
    remindDays: string;
    notes: string;
}

export const MaintenanceJobForm = ({
    job,
    persons,
    canRemind,
    onDone,
}: MaintenanceJobFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.maintenance.create.useMutation();
    const update = trpc.maintenance.update.useMutation();
    const setArchived = trpc.maintenance.setArchived.useMutation();
    const remove = trpc.maintenance.remove.useMutation();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<MaintenanceJobFormValues>({
        defaultValues: {
            name: job?.name ?? "",
            area: (job?.area as MaintenanceArea | undefined) ?? "other",
            dueDate: job?.dueDate ?? todayIso(),
            repeat: job
                ? repeatValue(job.repeatEvery, job.repeatUnit)
                : "12:month",
            assigneeId: job?.assigneeId ?? "",
            remindDays: String(
                job?.remindDays ?? DEFAULT_MAINTENANCE_REMIND_DAYS
            ),
            notes: job?.notes ?? "",
        },
    });

    const archived = job?.archivedAt != null;

    const submit = handleSubmit(async (values) => {
        const fields = {
            name: values.name.trim(),
            area: values.area,
            notes: values.notes.trim() || null,
            assigneeId: values.assigneeId || null,
            dueDate: values.dueDate,
            ...parseRepeat(values.repeat),
            remindDays: Number(values.remindDays),
        };

        try {
            if (job) {
                await update.mutateAsync({ id: job.id, ...fields });
                if (archived) {
                    await setArchived.mutateAsync({
                        id: job.id,
                        archived: false,
                    });
                }
            } else {
                await create.mutateAsync(fields);
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.maintenance.invalidate();
        notifySuccess(
            job
                ? archived
                    ? `${fields.name} is back on the list.`
                    : `Saved ${fields.name}.`
                : `Added ${fields.name}.`
        );
        onDone();
    });

    const archive = async () => {
        if (!job) return;
        try {
            await setArchived.mutateAsync({ id: job.id, archived: true });
        } catch {
            return;
        }
        await utils.maintenance.invalidate();
        notifySuccess(`Archived ${job.name}.`);
        onDone();
    };

    const deleteJob = async () => {
        if (!job) return;
        try {
            await remove.mutateAsync({ id: job.id });
        } catch {
            return;
        }
        await utils.maintenance.invalidate();
        notifySuccess(`Deleted ${job.name}.`);
        onDone();
    };

    const assigneeOptions = persons.map((person) => ({
        value: person.id,
        label: person.displayName,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Job"
                    placeholder="e.g. Boiler service"
                    error={errors.name?.message}
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Name the job.",
                    })}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormChoiceField
                        control={control}
                        name="area"
                        label="Area"
                        options={AREA_OPTIONS}
                    />
                    <FormChoiceField
                        control={control}
                        name="assigneeId"
                        label="Who does it"
                        emptyLabel="Anyone"
                        options={assigneeOptions}
                    />
                    <TextField
                        label={job ? "Next due" : "First due"}
                        type="date"
                        error={errors.dueDate?.message}
                        {...register("dueDate", {
                            required: "When is it due?",
                        })}
                    />
                    <FormChoiceField
                        control={control}
                        name="repeat"
                        label="Repeats"
                        options={repeatOptionsFor(
                            job?.repeatEvery ?? 12,
                            job?.repeatUnit ?? "month"
                        )}
                    />
                </div>
                <TextField
                    label="Remind me"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_REMIND_DAYS}
                    description={
                        canRemind
                            ? "Days before. It goes to whoever does it, or everyone if anyone can."
                            : "Days before. Notifications aren’t set up on this server yet."
                    }
                    error={errors.remindDays?.message}
                    {...register("remindDays", {
                        validate: (value) => {
                            const days = Number(value);

                            return (
                                (Number.isInteger(days) &&
                                    days >= 0 &&
                                    days <= MAX_REMIND_DAYS) ||
                                `Between 0 and ${MAX_REMIND_DAYS} days.`
                            );
                        },
                    })}
                />
                <TextAreaField
                    label="Notes"
                    placeholder="Model, filter size, who to call"
                    rows={2}
                    {...register("notes")}
                />
            </div>

            <FormFooter
                aside={
                    job &&
                    (archived ? (
                        <ArchiveAction
                            label="Delete job"
                            consequence="Deletes the job and everything logged against it."
                            pending={remove.isPending}
                            onArchive={() => void deleteJob()}
                        />
                    ) : (
                        <ArchiveAction
                            label="Archive"
                            consequence="Takes it off the list and stops its reminders. Its history stays."
                            pending={setArchived.isPending}
                            onArchive={() => void archive()}
                        />
                    ))
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {job ? (archived ? "Restore" : "Save changes") : "Add job"}
                </Button>
            </FormFooter>
        </form>
    );
};
