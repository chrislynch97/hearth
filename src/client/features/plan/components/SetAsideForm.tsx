import { useForm } from "react-hook-form";
import { fromMinor, toMinor } from "@shared/money";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/features/plan/components/ArchiveAction";
import type { Pot, SetAside } from "../../../../server/db/schema";

export interface SetAsideFormProps {
    pot: Pot;
    /** Absent when adding. */
    setAside: SetAside | undefined;
    onDone: () => void;
}

const RECURRENCES = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
];

interface SetAsideFormValues {
    name: string;
    amountMajor: string;
    recurrence: string;
    includeInEmergencyFund: boolean;
}

/** One contribution into a pot. A pot can have several — "Running", "Squash" —
 *  and each is added on its own rather than as a part of some breakdown. */
export const SetAsideForm = ({ pot, setAside, onDone }: SetAsideFormProps) => {
    const utils = trpc.useUtils();
    const money = useMoney();
    const create = trpc.setAside.create.useMutation();
    const update = trpc.setAside.update.useMutation();
    const archive = trpc.setAside.archive.useMutation();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<SetAsideFormValues>({
        defaultValues: {
            // An unnamed contribution is stored under the pot's own name.
            name: setAside && setAside.name !== pot.name ? setAside.name : "",
            amountMajor: setAside
                ? String(fromMinor(setAside.amount, money.decimalPlaces))
                : "",
            recurrence: setAside?.recurrence ?? "monthly",
            includeInEmergencyFund: setAside
                ? setAside.includeInEmergencyFund !== 0
                : true,
        },
    });

    const refresh = () =>
        Promise.all([
            utils.setAside.list.invalidate(),
            utils.plan.funding.invalidate(),
        ]);

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim() || pot.name;
        const fields = {
            name,
            amount: toMinor(Number(values.amountMajor), money.decimalPlaces),
            recurrence: values.recurrence as "monthly" | "quarterly" | "yearly",
            includeInEmergencyFund: values.includeInEmergencyFund,
        };

        try {
            if (setAside) {
                await update.mutateAsync({
                    id: setAside.id,
                    expectedUpdatedAt: setAside.updatedAt,
                    ...fields,
                });
            } else {
                await create.mutateAsync({
                    ...fields,
                    potId: pot.id,
                    ownerId: pot.ownerId,
                });
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await refresh();
        notifySuccess(
            setAside ? `Saved ${name}.` : `Added ${name} to ${pot.name}.`
        );
        onDone();
    });

    const handleArchive = async () => {
        if (!setAside) return;
        try {
            await archive.mutateAsync({ id: setAside.id });
        } catch {
            return;
        }
        await refresh();
        notifySuccess(`Removed it from ${pot.name}.`);
        onDone();
    };

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder={pot.name}
                    description="Optional — name it when a pot is filled from more than one thing."
                    autoFocus
                    {...register("name")}
                />
                <div className="flex gap-2">
                    <TextField
                        label="Amount"
                        placeholder="0.00"
                        inputMode="decimal"
                        prefix={money.symbol}
                        className="flex-1"
                        error={errors.amountMajor?.message}
                        {...register("amountMajor", {
                            validate: (value) =>
                                Number(value) > 0 || "Enter an amount.",
                        })}
                    />
                    <SelectField
                        label="Every"
                        options={RECURRENCES}
                        className="w-32"
                        {...register("recurrence")}
                    />
                </div>
                <Checkbox
                    label="Counts toward the emergency fund"
                    {...register("includeInEmergencyFund")}
                />
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {setAside ? "Save changes" : "Add set-aside"}
                </Button>
            </div>

            {setAside && (
                <ArchiveAction
                    label="Remove set-aside"
                    consequence="It stops filling this pot, and the pot needs that much less each period."
                    pending={archive.isPending}
                    onArchive={() => void handleArchive()}
                />
            )}
        </form>
    );
};
