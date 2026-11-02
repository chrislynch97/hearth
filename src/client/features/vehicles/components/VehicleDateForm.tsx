import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextField } from "@/components/ui/TextField";
import {
    DATE_KIND_OPTIONS,
    REPEAT_OPTIONS,
    type VehicleDateRow,
} from "@/features/vehicles/model";
import {
    DEFAULT_REMIND_DAYS,
    DEFAULT_REPEAT_MONTHS,
    vehicleDateName,
    type VehicleDateKind,
} from "@shared/vehicles";
import { MAX_REMIND_DAYS } from "@shared/schedule";

export interface VehicleDateFormProps {
    vehicleId: string;
    /** Absent when adding. */
    date: VehicleDateRow | undefined;
    /** Push is set up on this server, so a reminder can actually go out. */
    canRemind: boolean;
    onDone: () => void;
}

interface VehicleDateFormValues {
    kind: VehicleDateKind;
    label: string;
    dueDate: string;
    repeat: string;
    remindDays: string;
}

export const VehicleDateForm = ({
    vehicleId,
    date,
    canRemind,
    onDone,
}: VehicleDateFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.vehicles.dates.create.useMutation();
    const update = trpc.vehicles.dates.update.useMutation();
    const remove = trpc.vehicles.dates.remove.useMutation();

    const {
        register,
        control,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting, dirtyFields },
    } = useForm<VehicleDateFormValues>({
        defaultValues: {
            kind: (date?.kind as VehicleDateKind | undefined) ?? "mot",
            label: date?.label ?? "",
            dueDate: date?.dueDate ?? "",
            repeat: String(date ? (date.repeatMonths ?? 0) : DEFAULT_REPEAT_MONTHS),
            remindDays: String(date?.remindDays ?? DEFAULT_REMIND_DAYS.mot),
        },
    });
    const kind = useWatch({ control, name: "kind" });

    const submit = handleSubmit(async (values) => {
        const repeat = Number(values.repeat);
        const fields = {
            kind: values.kind,
            label: values.kind === "other" ? (values.label ?? "").trim() || null : null,
            dueDate: values.dueDate,
            repeatMonths: repeat > 0 ? repeat : null,
            remindDays: Number(values.remindDays),
        };
        const name = vehicleDateName(fields.kind, fields.label);

        try {
            if (date) {
                await update.mutateAsync({ id: date.id, ...fields });
            } else {
                await create.mutateAsync({ vehicleId, ...fields });
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.vehicles.invalidate();
        notifySuccess(date ? `Saved ${name}.` : `Added ${name}.`);
        onDone();
    });

    const handleRemove = async () => {
        if (!date) return;
        try {
            await remove.mutateAsync({ id: date.id });
        } catch {
            return;
        }
        await utils.vehicles.invalidate();
        notifySuccess(`Deleted ${date.name}.`);
        onDone();
    };

    // A new kind brings its own lead time, unless one was typed in.
    const pickKind = (value: string) => {
        if (!dirtyFields.remindDays) {
            setValue(
                "remindDays",
                String(DEFAULT_REMIND_DAYS[value as VehicleDateKind] ?? 14)
            );
        }
    };

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormChoiceField
                        control={control}
                        name="kind"
                        label="What"
                        options={DATE_KIND_OPTIONS}
                        onValueChange={pickKind}
                    />
                    {kind === "other" && (
                        <TextField
                            label="Called"
                            placeholder="e.g. Cambelt"
                            error={errors.label?.message}
                            {...register("label", {
                                shouldUnregister: true,
                                validate: (value) =>
                                    value.trim().length > 0 || "Name it.",
                            })}
                        />
                    )}
                    <TextField
                        label="Due"
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
                        options={REPEAT_OPTIONS}
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
                            ? "Days before, as a notification on the devices you’ve turned them on for."
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
            </div>

            <FormFooter
                aside={
                    date && (
                        <ArchiveAction
                            label="Delete date"
                            consequence="Stops its reminders. Costs already logged stay."
                            pending={remove.isPending}
                            onArchive={() => void handleRemove()}
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
                    {date ? "Save changes" : "Add date"}
                </Button>
            </FormFooter>
        </form>
    );
};
