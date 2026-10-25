import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { formatMoney } from "@shared/money";
import { goalPath, isItemByItem, unpaidTotal } from "@shared/savings";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { parseRate, rateInput, validRate } from "@/interestRate";
import { orderMembers } from "@/potOptions";
import { useFormatDate, useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import {
    SegmentedControl,
    type SegmentedOption,
} from "@/components/ui/SegmentedControl";
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
    /** Opens with the interest rate focused, for the header's rate button. */
    focusRate?: boolean;
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
    rate: string;
}

const NEW_POT = "new";

type Shape = "target" | "items";

const SHAPES: SegmentedOption<Shape>[] = [
    { value: "target", label: "One target" },
    { value: "items", label: "Item by item" },
];

const SHAPE_HELP: Record<Shape, string> = {
    target: "Save towards a total by one date. Items, if you add them, come out of it.",
    items: "No overall total or date: each item is saved for by its own date, all from this pot.",
};

export const GoalForm = ({
    goal,
    pots = [],
    members = [],
    focusRate = false,
    onCreated,
    onDone,
}: GoalFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.savings.createGoal.useMutation();
    const update = trpc.savings.updateGoal.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();
    const [shape, setShape] = useState<Shape>(
        goal && isItemByItem(goal.goal) ? "items" : "target"
    );
    // The rate typed for a new pot, kept while an existing pot's own is shown.
    const [newPotRate, setNewPotRate] = useState("");

    const ordered = orderMembers(members);
    const {
        register,
        control,
        getValues,
        setValue,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<GoalFormValues>({
        defaultValues: {
            name: goal?.goal.name ?? "",
            // An item-by-item goal switching back starts from what its items come to.
            target: moneyInput(goal?.target.targetAmount ?? null, money.decimalPlaces),
            date: goal?.target.targetDate ?? "",
            potId: NEW_POT,
            ownerId: ordered.find((m) => m.kind === "joint")?.id ?? ordered[0]?.id ?? "",
            rate: rateInput(goal?.interestRateBp ?? null),
        },
    });
    const potId = useWatch({ control, name: "potId" });
    const typedTarget = useWatch({ control, name: "target" });

    const unpaid = goal ? unpaidTotal(goal.items) : 0;
    const belowItems =
        shape === "target" &&
        validMoney(typedTarget, true) === true &&
        (parseOptionalMoney(typedTarget, money.decimalPlaces) ?? 0) < unpaid;
    // What switching an existing one-target goal to item by item changes.
    const switching = goal !== undefined && !isItemByItem(goal.goal) && shape === "items";
    const undated = goal?.items.filter((item) => !item.dueDate && !item.paidOn).length ?? 0;
    const unitemised = Math.max(0, (goal?.goal.targetAmount ?? 0) - unpaid);

    const submit = handleSubmit(async (values) => {
        let createdPath: string | null = null;
        const name = values.name.trim();
        const itemByItem = shape === "items";
        const fields = {
            name,
            targetAmount: itemByItem
                ? null
                : (parseOptionalMoney(values.target, money.decimalPlaces) ?? 0),
            targetDate: itemByItem ? null : values.date,
            interestRateBp: parseRate(values.rate),
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
                <div className="flex flex-col items-start gap-1.5">
                    <SegmentedControl
                        label="How it's planned"
                        options={SHAPES}
                        value={shape}
                        onChange={setShape}
                    />
                    <p className="text-xs leading-snug text-text-muted">
                        {SHAPE_HELP[shape]}
                    </p>
                </div>
                {switching && (undated > 0 || unitemised > 0) && goal.goal.targetDate !== null && (
                    <Callout>
                        {undated > 0 &&
                            `${undated === 1 ? "The item" : `The ${undated} items`} with no date of ${undated === 1 ? "its" : "their"} own will be due on ${formatDate(goal.goal.targetDate)}. `}
                        {unitemised > 0 &&
                            `The ${formatMoney(unitemised, money)} not itemised drops out of the plan.`}
                    </Callout>
                )}
                {shape === "target" && (
                    <>
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
                        {belowItems && (
                            <Callout tone="attention">
                                The unpaid items come to{" "}
                                {formatMoney(unpaid, money)}, more than this
                                target. The plan will still need{" "}
                                {formatMoney(unpaid, money)}; Items offers to
                                raise the target to match.
                            </Callout>
                        )}
                        <TextField
                            label="Date"
                            type="date"
                            error={errors.date?.message}
                            {...register("date", {
                                validate: (value) =>
                                    value !== "" || "Pick a date.",
                            })}
                        />
                    </>
                )}
                {!goal && (
                    <SelectField
                        label="Pot"
                        description="The money goes in through this pot's set-aside, so Plan and Funding see it."
                        options={potOptions}
                        {...register("potId", {
                            // An existing pot brings its rate; going back to a new one brings back what was typed.
                            onChange: (event: { target: { value: string } }) => {
                                if (potId === NEW_POT) setNewPotRate(getValues("rate"));
                                const picked = pots.find((pot) => pot.id === event.target.value);
                                setValue(
                                    "rate",
                                    picked ? rateInput(picked.interestRateBp) : newPotRate
                                );
                            },
                        })}
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
                <TextField
                    label="Interest rate (AER %)"
                    description="What the pot earns, if anything. It's the pot's rate, so Plan shows it too."
                    placeholder="Optional"
                    inputMode="decimal"
                    data-autofocus={focusRate || undefined}
                    error={errors.rate?.message}
                    {...register("rate", { validate: validRate })}
                />
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
