import { useForm } from "react-hook-form";
import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
    type OccasionSummary,
} from "@/features/gifts/model";

export interface OccasionFormProps {
    /** Absent when adding. */
    occasion: OccasionSummary | undefined;
    /** Every occasion, to copy people from when adding. */
    occasions: OccasionSummary[];
    onCreated: (id: string) => void;
    onDone: () => void;
}

interface OccasionFormValues {
    name: string;
    date: string;
    budget: string;
    copyFromId: string;
}

export const OccasionForm = ({
    occasion,
    occasions,
    onCreated,
    onDone,
}: OccasionFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.gifts.createOccasion.useMutation();
    const update = trpc.gifts.updateOccasion.useMutation();
    const setArchived = trpc.gifts.setArchived.useMutation();
    const remove = trpc.gifts.removeOccasion.useMutation();
    const money = useMoney();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<OccasionFormValues>({
        defaultValues: {
            name: occasion?.name ?? "",
            date: occasion?.date ?? "",
            budget: moneyInput(occasion?.budget ?? null, money.decimalPlaces),
            copyFromId: "",
        },
    });

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const fields = {
            name,
            date: values.date || null,
            budget: parseOptionalMoney(values.budget, money.decimalPlaces),
        };

        let raised: number | null = null;
        try {
            if (occasion) {
                await update.mutateAsync({
                    id: occasion.id,
                    expectedUpdatedAt: occasion.updatedAt,
                    ...fields,
                });
            } else {
                const created = await create.mutateAsync({
                    ...fields,
                    copyFromId: values.copyFromId || undefined,
                });
                raised = created.raisedOccasionBudget;
                onCreated(created.id);
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.gifts.invalidate();
        const done = occasion ? `Saved ${name}.` : `Added ${name}.`;
        notifySuccess(
            raised === null
                ? done
                : `${done} Raised its budget to ${formatMoney(raised, money)} to cover the people copied in.`
        );
        onDone();
    });

    const toggleArchived = async () => {
        if (!occasion) return;
        const archived = occasion.archivedAt === null;
        try {
            await setArchived.mutateAsync({ id: occasion.id, archived });
        } catch {
            return;
        }
        await utils.gifts.invalidate();
        notifySuccess(
            archived
                ? `Archived ${occasion.name}.`
                : `Restored ${occasion.name}.`
        );
        onDone();
    };

    const handleRemove = async () => {
        if (!occasion) return;
        try {
            await remove.mutateAsync({ id: occasion.id });
        } catch {
            return;
        }
        // Just the list: the page moves off the deleted occasion, rather than
        // refetching it and getting a not-found.
        await utils.gifts.occasions.invalidate();
        notifySuccess(`Deleted ${occasion.name}.`);
        onDone();
    };

    const copyOptions = [...occasions].reverse().map((option) => ({
        value: option.id,
        label: option.name,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. Christmas 2026"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter a name.",
                    })}
                />
                <div className="grid grid-cols-2 gap-3">
                    <TextField
                        label="Date"
                        type="date"
                        {...register("date")}
                    />
                    <TextField
                        label="Budget"
                        description={
                            occasion && occasion.allocated > 0
                                ? `People's budgets come to ${formatMoney(occasion.allocated, money)}.`
                                : undefined
                        }
                        placeholder="Optional"
                        inputMode="decimal"
                        prefix={money.symbol}
                        error={errors.budget?.message}
                        {...register("budget", {
                            validate: (value) => validMoney(value, false),
                        })}
                    />
                </div>
                {!occasion && copyOptions.length > 0 && (
                    <FormChoiceField
                        control={control}
                        name="copyFromId"
                        label="Copy people from"
                        description="Brings over their names and budgets, not their gifts."
                        emptyLabel="Start empty"
                        options={copyOptions}
                    />
                )}
            </div>

            <FormFooter
                aside={
                    occasion && (
                        <>
                            <Button
                                className="max-sm:h-9"
                                disabled={setArchived.isPending}
                                onClick={() => void toggleArchived()}
                            >
                                {occasion.archivedAt === null
                                    ? "Archive"
                                    : "Restore"}
                            </Button>
                            <ArchiveAction
                                label="Delete"
                                consequence="Deletes it with every person and gift on it. This can't be undone."
                                pending={remove.isPending}
                                onArchive={() => void handleRemove()}
                            />
                        </>
                    )
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {occasion ? "Save changes" : "Add occasion"}
                </Button>
            </FormFooter>
        </form>
    );
};
