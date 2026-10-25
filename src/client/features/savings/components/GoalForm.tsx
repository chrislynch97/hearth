import { useForm, useWatch } from "react-hook-form";
import { goalPath } from "@shared/savings";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { orderMembers } from "@/potOptions";
import { useMoney } from "@/useMoney";
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
    /** Adding only: pots a new goal can sit on (no goal yet, no bills). */
    pots?: Pot[];
    members?: Member[];
    /** After adding, with the new goal's URL segment. */
    onCreated?: (path: string) => void;
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
    pots = [],
    members = [],
    onCreated,
    onDone,
}: GoalFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.savings.createGoal.useMutation();
    const update = trpc.savings.updateGoal.useMutation();
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
        let createdPath: string | null = null;
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
                createdPath = goalPath(created.shortId, created.name);
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        // A new pot shows on Plan and Funding too. Refreshed before moving to
        // a new goal, so its page finds it straight away.
        await Promise.all([utils.savings.invalidate(), utils.pots.invalidate()]);
        notifySuccess(goal ? `Saved ${name}.` : `Added ${name}.`);
        if (createdPath) onCreated?.(createdPath);
        onDone();
    });

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
                <TextField
                    label="Target"
                    description="What the pot should hold by the date."
                    inputMode="decimal"
                    prefix={money.symbol}
                    error={errors.target?.message}
                    {...register("target", {
                        validate: (value) => validMoney(value, true),
                    })}
                />
                <TextField
                    label="Date"
                    type="date"
                    error={errors.date?.message}
                    {...register("date", {
                        validate: (value) => value !== "" || "Pick a date.",
                    })}
                />
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
        </form>
    );
};
