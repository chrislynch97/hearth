import { useForm, useWatch } from "react-hook-form";
import { formatMoney } from "@shared/money";
import type { SavingsPlanBalance } from "@shared/savings";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type { SavingsItem } from "../../../../server/db/schema";

export interface PaidFormProps {
    item: SavingsItem;
    /** Null for an item-by-item goal: there's no target to take it off. */
    target: number | null;
    /** The balance the plan builds on, to explain a payment on the same day. */
    anchor: SavingsPlanBalance | null;
    today: string;
    onDone: () => void;
}

interface PaidFormValues {
    paidOn: string;
}

/** Marking an item paid is one decision: when, and whether its cost comes off
 *  the target. Nothing is saved, or shown ticked, until one is picked. An
 *  item-by-item goal has no target, so it only asks when. */
export const PaidForm = ({
    item,
    target,
    anchor,
    today,
    onDone,
}: PaidFormProps) => {
    const utils = trpc.useUtils();
    const setPaid = trpc.savings.setPaid.useMutation();
    const money = useMoney();
    const formatDate = useFormatDate();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<PaidFormValues>({ defaultValues: { paidOn: today } });
    const paidOn = useWatch({ control, name: "paidOn" });

    const save = (reduceTarget: boolean) =>
        handleSubmit(async (values) => {
            try {
                await setPaid.mutateAsync({
                    id: item.id,
                    paidOn: values.paidOn,
                    reduceTarget,
                });
            } catch {
                return; // surfaced by the global error handler; keep the form open
            }
            await utils.savings.invalidate();
            notifySuccess(
                reduceTarget
                    ? `Marked ${item.name} paid and took ${formatMoney(item.amount, money)} off the target.`
                    : `Marked ${item.name} paid.`
            );
            onDone();
        });

    return (
        <form onSubmit={(event) => void save(false)(event)}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Paid on"
                    type="date"
                    max={today}
                    error={errors.paidOn?.message}
                    autoFocus
                    {...register("paidOn", {
                        validate: (value) =>
                            (value !== "" && value <= today) ||
                            "Pick today or a day before.",
                    })}
                />
                {anchor && paidOn === anchor.asOfDate && (
                    <p className="text-xs leading-snug text-text-muted">
                        The {formatMoney(anchor.amount, money)} balance recorded
                        on {formatDate(anchor.asOfDate)} is taken as already
                        having this out. If it doesn't, record that day's balance
                        again after paying.
                    </p>
                )}
                {target !== null && (
                    <>
                        <p className="text-base">
                            Take {formatMoney(item.amount, money)} off the
                            target?{" "}
                            <span className="tabular text-text-secondary">
                                {formatMoney(target, money)} →{" "}
                                {formatMoney(Math.max(0, target - item.amount), money)}
                            </span>
                        </p>
                        <p className="text-xs leading-snug text-text-muted">
                            Keeping the target leaves the money in the plan as
                            headroom.
                        </p>
                    </>
                )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                {target === null ? (
                    <Button variant="solid" type="submit" disabled={isSubmitting}>
                        Mark paid
                    </Button>
                ) : (
                    <>
                        <Button
                            disabled={isSubmitting}
                            onClick={() => void save(false)()}
                        >
                            Keep {formatMoney(target, money)}
                        </Button>
                        <Button
                            variant="solid"
                            disabled={isSubmitting}
                            onClick={() => void save(true)()}
                        >
                            Take it off
                        </Button>
                    </>
                )}
            </div>
        </form>
    );
};
