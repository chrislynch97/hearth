import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { formatMoney } from "@shared/money";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import {
    moneyInput,
    parseOptionalMoney,
    raisedOccasionBudget,
    validMoney,
    type OccasionDetail,
    type RecipientWithGifts,
} from "@/features/gifts/model";

export interface RecipientFormProps {
    /** The occasion they're on, for its budget and everyone else's. */
    occasion: OccasionDetail;
    /** Absent when adding. */
    recipient: RecipientWithGifts | undefined;
    onDone: () => void;
}

interface RecipientFormValues {
    name: string;
    budget: string;
}

export const RecipientForm = ({
    occasion,
    recipient,
    onDone,
}: RecipientFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.gifts.createRecipient.useMutation();
    const update = trpc.gifts.updateRecipient.useMutation();
    const remove = trpc.gifts.removeRecipient.useMutation();
    const money = useMoney();

    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<RecipientFormValues>({
        defaultValues: {
            name: recipient?.name ?? "",
            budget: moneyInput(recipient?.budget ?? null, money.decimalPlaces),
        },
    });

    const typed = useWatch({ control, name: "budget" });
    const raiseTo =
        validMoney(typed, false) === true
            ? raisedOccasionBudget(
                  occasion.budget,
                  occasion.allocated,
                  recipient?.budget ?? null,
                  parseOptionalMoney(typed, money.decimalPlaces)
              )
            : null;

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const budget = parseOptionalMoney(values.budget, money.decimalPlaces);

        let raised: number | null;
        try {
            if (recipient) {
                ({ raisedOccasionBudget: raised } = await update.mutateAsync({
                    id: recipient.id,
                    expectedUpdatedAt: recipient.updatedAt,
                    name,
                    budget,
                }));
            } else {
                ({ raisedOccasionBudget: raised } = await create.mutateAsync({
                    occasionId: occasion.id,
                    name,
                    budget,
                }));
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.gifts.invalidate();
        const done = recipient ? `Saved ${name}.` : `Added ${name}.`;
        notifySuccess(
            raised === null
                ? done
                : `${done} Raised the ${occasion.name} budget to ${formatMoney(raised, money)}.`
        );
        onDone();
    });

    const handleRemove = async () => {
        if (!recipient) return;
        try {
            await remove.mutateAsync({ id: recipient.id });
        } catch {
            return;
        }
        await utils.gifts.invalidate();
        notifySuccess(`Removed ${recipient.name}.`);
        onDone();
    };

    const giftCount = recipient?.gifts.length ?? 0;

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. Mum"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter a name.",
                    })}
                />
                <TextField
                    label="Budget"
                    description="What you mean to spend on them. Leave blank for no limit."
                    placeholder="Optional"
                    inputMode="decimal"
                    prefix={money.symbol}
                    error={errors.budget?.message}
                    {...register("budget", {
                        validate: (value) => validMoney(value, false),
                    })}
                />
                {raiseTo !== null && occasion.budget !== null && (
                    <Callout tone="attention">
                        Everyone's budgets would come to{" "}
                        {formatMoney(raiseTo, money)}, over the{" "}
                        {formatMoney(occasion.budget, money)} for{" "}
                        {occasion.name}. Saving raises the {occasion.name}{" "}
                        budget to {formatMoney(raiseTo, money)}.
                    </Callout>
                )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {recipient ? "Save changes" : "Add person"}
                </Button>
            </div>

            {recipient && (
                <ArchiveAction
                    label="Remove person"
                    consequence={
                        giftCount === 0
                            ? "Takes them off this occasion only."
                            : `Takes them off this occasion along with their ${giftCount === 1 ? "gift" : `${giftCount} gifts`}. Other occasions keep theirs.`
                    }
                    pending={remove.isPending}
                    onArchive={() => void handleRemove()}
                />
            )}
        </form>
    );
};
