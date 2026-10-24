import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { orderMembers } from "@/potOptions";
import { useMoney } from "@/useMoney";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
    type GoalPlan,
} from "@/features/savings/model";
import type { Member, Pot } from "../../../../server/db/schema";

export interface GoalFormProps {
    /** Absent when adding. */
    goal: GoalPlan | undefined;
    /** Pots a new goal can sit on: no goal yet, no bills. */
    pots: Pot[];
    members: Member[];
    onCreated: (id: string) => void;
    onDone: () => void;
}

interface GoalFormValues {
    name: string;
    target: string;
    date: string;
    /** A pot id, or NEW_POT. */
    potId: string;
    ownerId: string;
}

const NEW_POT = "new";

export const GoalForm = ({
    goal,
    pots,
    members,
    onCreated,
    onDone,
}: GoalFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.savings.createGoal.useMutation();
    const update = trpc.savings.updateGoal.useMutation();
    const setArchived = trpc.savings.setArchived.useMutation();
    const remove = trpc.savings.removeGoal.useMutation();
    const money = useMoney();

    const ordered = orderMembers(members);
    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<GoalFormValues>({
        defaultValues: {
            name: goal?.goal.name ?? "",
            target: moneyInput(goal?.goal.targetAmount ?? null, money.decimalPlaces),
            date: goal?.goal.targetDate ?? "",
            potId: NEW_POT,
            ownerId: ordered.find((m) => m.kind === "joint")?.id ?? ordered[0]?.id ?? "",
        },
    });
    const potId = useWatch({ control, name: "potId" });

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const fields = {
            name,
            targetAmount: parseOptionalMoney(values.target, money.decimalPlaces) ?? 0,
            targetDate: values.date,
        };
        try {
            if (goal) {
                await update.mutateAsync({
                    id: goal.goal.id,
                    expectedUpdatedAt: goal.goal.updatedAt,
                    ...fields,
                });
            } else {
                const created = await create.mutateAsync({
                    ...fields,
                    pot:
                        values.potId === NEW_POT
                            ? { name, ownerId: values.ownerId }
                            : { id: values.potId },
                });
                onCreated(created.id);
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        // A new pot shows on Plan and Funding too.
        await Promise.all([utils.savings.invalidate(), utils.pots.invalidate()]);
        notifySuccess(goal ? `Saved ${name}.` : `Added ${name}.`);
        onDone();
    });

    const toggleArchived = async () => {
        if (!goal) return;
        const archived = goal.goal.archivedAt === null;
        try {
            await setArchived.mutateAsync({ id: goal.goal.id, archived });
        } catch {
            return;
        }
        await utils.savings.invalidate();
        notifySuccess(
            archived ? `Archived ${goal.goal.name}.` : `Restored ${goal.goal.name}.`
        );
        onDone();
    };

    const handleRemove = async () => {
        if (!goal) return;
        try {
            await remove.mutateAsync({ id: goal.goal.id });
        } catch {
            return;
        }
        // Just the list: the page moves off the deleted goal rather than
        // refetching it and getting a not-found.
        await utils.savings.goals.invalidate();
        notifySuccess(`Deleted ${goal.goal.name}. The ${goal.potName} pot is still on Plan.`);
        onDone();
    };

    const potOptions = [
        { value: NEW_POT, label: "A new pot" },
        ...pots.map((pot) => ({ value: pot.id, label: pot.name })),
    ];
    const ownerOptions = ordered.map((member) => ({
        value: member.id,
        label: member.displayName,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. Wedding"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter a name.",
                    })}
                />
                <div className="flex gap-2">
                    <TextField
                        label="Target"
                        description="What the pot should hold by the date."
                        inputMode="decimal"
                        prefix={money.symbol}
                        className="flex-1"
                        error={errors.target?.message}
                        {...register("target", {
                            validate: (value) => validMoney(value, true),
                        })}
                    />
                    <TextField
                        label="Date"
                        type="date"
                        className="flex-1"
                        error={errors.date?.message}
                        {...register("date", {
                            validate: (value) => value !== "" || "Pick a date.",
                        })}
                    />
                </div>
                {!goal && (
                    <SelectField
                        label="Pot"
                        description="The money goes in through this pot's set-aside, so Plan and Funding see it."
                        options={potOptions}
                        {...register("potId")}
                    />
                )}
                {!goal && potId === NEW_POT && (
                    <SelectField
                        label="Whose pot"
                        description="Named after the goal. You can rename or recategorise it on Plan."
                        options={ownerOptions}
                        {...register("ownerId")}
                    />
                )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {goal ? "Save changes" : "Add goal"}
                </Button>
            </div>

            {goal && (
                <>
                    <div className="mt-4 border-t border-border pt-3.5">
                        <Button
                            variant="ghost"
                            compact
                            className="px-0"
                            disabled={setArchived.isPending}
                            onClick={() => void toggleArchived()}
                        >
                            {goal.goal.archivedAt === null
                                ? "Archive goal"
                                : "Restore goal"}
                        </Button>
                        <p className="mt-1.5 text-xs leading-snug text-text-muted">
                            {goal.goal.archivedAt === null
                                ? `Moves it under Archived once it's done. The ${goal.potName} pot and its set-aside stay as they are.`
                                : "Puts it back with the live goals."}
                        </p>
                    </div>
                    <ArchiveAction
                        label="Delete goal"
                        consequence={`Deletes it with its items and recorded balances. The ${goal.potName} pot stays. This can't be undone.`}
                        pending={remove.isPending}
                        onArchive={() => void handleRemove()}
                    />
                </>
            )}
        </form>
    );
};
