import { useForm, useWatch } from "react-hook-form";
import { formatMoney } from "@shared/money";
import { raisedTarget, unpaidTotal } from "@shared/savings";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
} from "@/features/savings/model";
import type { SavingsGoal, SavingsItem } from "../../../../server/db/schema";

export interface ItemFormProps {
    goal: SavingsGoal;
    /** The goal's items as saved, to measure this one against the target. */
    items: SavingsItem[];
    /** Absent when adding. */
    item: SavingsItem | undefined;
    onDone: () => void;
}

interface ItemFormValues {
    name: string;
    amount: string;
    dueDate: string;
}

export const ItemForm = ({ goal, items, item, onDone }: ItemFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.savings.createItem.useMutation();
    const update = trpc.savings.updateItem.useMutation();
    const remove = trpc.savings.removeItem.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<ItemFormValues>({
        defaultValues: {
            name: item?.name ?? "",
            amount: moneyInput(item?.amount ?? null, money.decimalPlaces),
            dueDate: item?.dueDate ?? "",
        },
    });

    const typed = useWatch({ control, name: "amount" });
    const target = goal.targetAmount;
    const others = unpaidTotal(items.filter((other) => other.id !== item?.id));
    // A paid item's cost has left the pot, so it allocates nothing.
    const counts = !item?.paidOn;
    const amount =
        validMoney(typed, false) === true
            ? (parseOptionalMoney(typed, money.decimalPlaces) ?? 0)
            : null;
    const raiseTo =
        target !== null && amount !== null
            ? raisedTarget(target, others, counts ? amount : 0)
            : null;
    const left =
        target !== null && amount !== null && counts && raiseTo === null
            ? target - others - amount
            : null;

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const fields = {
            name,
            amount: parseOptionalMoney(values.amount, money.decimalPlaces) ?? 0,
            dueDate: values.dueDate || null,
        };

        let raised: number | null;
        try {
            if (item) {
                ({ raisedTarget: raised } = await update.mutateAsync({
                    id: item.id,
                    expectedUpdatedAt: item.updatedAt,
                    ...fields,
                }));
            } else {
                ({ raisedTarget: raised } = await create.mutateAsync({
                    goalId: goal.id,
                    ...fields,
                }));
            }
        } catch {
            return;
        }
        await utils.savings.invalidate();
        const done = item ? `Saved ${name}.` : `Added ${name}.`;
        notifySuccess(
            raised === null
                ? done
                : `${done} Raised the target to ${formatMoney(raised, money)}.`
        );
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
                <TextField
                    label="Cost"
                    description={
                        left === null || target === null
                            ? undefined
                            : left === 0
                              ? `That allocates all of the ${formatMoney(target, money)} target.`
                              : `${formatMoney(left, money)} left to allocate of the ${formatMoney(target, money)} target.`
                    }
                    inputMode="decimal"
                    prefix={money.symbol}
                    error={errors.amount?.message}
                    {...register("amount", {
                        validate: (value) => validMoney(value, true),
                    })}
                />
                {raiseTo !== null && target !== null && (
                    <Notice
                        tone="attention"
                        title={`Saving raises the target to ${formatMoney(raiseTo, money)}`}
                    >
                        Items would come to {formatMoney(raiseTo, money)}, over
                        the {formatMoney(target, money)} target.
                    </Notice>
                )}
                {goal.targetDate === null ? (
                    <TextField
                        label="Due"
                        type="date"
                        error={errors.dueDate?.message}
                        {...register("dueDate", {
                            validate: (value) =>
                                value !== "" || "Pick the date it's due.",
                        })}
                    />
                ) : (
                    <TextField
                        label="Due"
                        type="date"
                        description={`Leave empty for the day itself, ${formatDate(goal.targetDate)}.`}
                        {...register("dueDate")}
                    />
                )}
            </div>

            <div className="mt-5 flex justify-end">
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
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
