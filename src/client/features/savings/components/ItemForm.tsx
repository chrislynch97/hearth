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
import type { SavingsGoal, SavingsItem } from "../../../../server/db/schema";

export interface ItemFormProps {
    goal: SavingsGoal;
    /** Absent when adding. */
    item: SavingsItem | undefined;
    onDone: () => void;
}

interface ItemFormValues {
    name: string;
    amount: string;
    dueDate: string;
}

export const ItemForm = ({ goal, item, onDone }: ItemFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.savings.createItem.useMutation();
    const update = trpc.savings.updateItem.useMutation();
    const remove = trpc.savings.removeItem.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ItemFormValues>({
        defaultValues: {
            name: item?.name ?? "",
            amount: moneyInput(item?.amount ?? null, money.decimalPlaces),
            dueDate: item?.dueDate ?? "",
        },
    });

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const fields = {
            name,
            amount: parseOptionalMoney(values.amount, money.decimalPlaces) ?? 0,
            dueDate: values.dueDate || null,
        };
        try {
            if (item) {
                await update.mutateAsync({
                    id: item.id,
                    expectedUpdatedAt: item.updatedAt,
                    ...fields,
                });
            } else {
                await create.mutateAsync({ goalId: goal.id, ...fields });
            }
        } catch {
            return;
        }
        await utils.savings.invalidate();
        notifySuccess(item ? `Saved ${name}.` : `Added ${name}.`);
        onDone();
    });

    const handleRemove = async () => {
        if (!item) return;
        try {
            await remove.mutateAsync({ id: item.id });
        } catch {
            return;
        }
        await utils.savings.invalidate();
        notifySuccess(`Deleted ${item.name}.`);
        onDone();
    };

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. Cake"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter a name.",
                    })}
                />
                <div className="flex gap-2">
                    <TextField
                        label="Cost"
                        inputMode="decimal"
                        prefix={money.symbol}
                        className="flex-1"
                        error={errors.amount?.message}
                        {...register("amount", {
                            validate: (value) => validMoney(value, true),
                        })}
                    />
                    <TextField
                        label="Due"
                        type="date"
                        description={`Leave empty for the day itself, ${formatDate(goal.targetDate)}.`}
                        className="flex-1"
                        {...register("dueDate")}
                    />
                </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {item ? "Save changes" : "Add item"}
                </Button>
            </div>

            {item && (
                <ArchiveAction
                    label="Delete item"
                    consequence="Takes it out of the plan. This can't be undone."
                    pending={remove.isPending}
                    onArchive={() => void handleRemove()}
                />
            )}
        </form>
    );
};
