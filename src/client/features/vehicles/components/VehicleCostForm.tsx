import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
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
import {
    COST_KIND_OPTIONS,
    type VehicleCostRow,
} from "@/features/vehicles/model";
import { todayIso } from "@shared/dates";
import { VEHICLE_COST_LABEL, type VehicleCostKind } from "@shared/vehicles";

export interface VehicleCostFormProps {
    vehicleId: string;
    /** Absent when adding. */
    cost: VehicleCostRow | undefined;
    onDone: () => void;
}

interface VehicleCostFormValues {
    kind: VehicleCostKind;
    date: string;
    amount: string;
    note: string;
}

export const VehicleCostForm = ({
    vehicleId,
    cost,
    onDone,
}: VehicleCostFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.vehicles.costs.create.useMutation();
    const update = trpc.vehicles.costs.update.useMutation();
    const remove = trpc.vehicles.costs.remove.useMutation();
    const money = useMoney();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<VehicleCostFormValues>({
        defaultValues: {
            kind: (cost?.kind as VehicleCostKind | undefined) ?? "repair",
            date: cost?.date ?? todayIso(),
            amount: moneyInput(cost?.amount ?? null, money.decimalPlaces),
            note: cost?.note ?? "",
        },
    });

    const submit = handleSubmit(async (values) => {
        const fields = {
            kind: values.kind,
            date: values.date,
            amount: parseOptionalMoney(values.amount, money.decimalPlaces) ?? 0,
            note: values.note.trim() || null,
        };
        const label = VEHICLE_COST_LABEL[fields.kind];

        try {
            if (cost) {
                await update.mutateAsync({ id: cost.id, ...fields });
            } else {
                await create.mutateAsync({ vehicleId, ...fields });
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.vehicles.invalidate();
        notifySuccess(cost ? `Saved ${label}.` : `Logged ${label}.`);
        onDone();
    });

    const handleRemove = async () => {
        if (!cost) return;
        try {
            await remove.mutateAsync({ id: cost.id });
        } catch {
            return;
        }
        await utils.vehicles.invalidate();
        notifySuccess("Deleted the cost.");
        onDone();
    };

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormChoiceField
                        control={control}
                        name="kind"
                        label="What"
                        options={COST_KIND_OPTIONS}
                    />
                    <TextField
                        label="Cost"
                        placeholder="0.00"
                        inputMode="decimal"
                        prefix={money.symbol}
                        error={errors.amount?.message}
                        {...register("amount", {
                            validate: (value) => validMoney(value, true),
                        })}
                    />
                    <TextField
                        label="Date"
                        type="date"
                        error={errors.date?.message}
                        {...register("date", { required: "When was it?" })}
                    />
                    <TextField
                        label="Note"
                        placeholder="e.g. Two front tyres"
                        {...register("note")}
                    />
                </div>
            </div>

            <FormFooter
                aside={
                    cost && (
                        <ArchiveAction
                            label="Delete cost"
                            consequence="Takes it out of the vehicle’s totals."
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
                    {cost ? "Save changes" : "Log cost"}
                </Button>
            </FormFooter>
        </form>
    );
};
