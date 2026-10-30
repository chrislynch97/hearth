import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import {
    STATUS_OPTIONS,
    moneyInput,
    parseOptionalMoney,
    validMoney,
    type GiftStatus,
    type RecipientWithGifts,
} from "@/features/gifts/model";
import type { Gift } from "../../../../server/db/schema";

export interface GiftFormProps {
    /** Absent when adding. */
    gift: Gift | undefined;
    /** Who it's for when adding; the gift's own recipient when editing. */
    recipientId: string;
    /** Everyone on the occasion, so a gift can move to someone else. */
    recipients: RecipientWithGifts[];
    onDone: () => void;
}

interface GiftFormValues {
    name: string;
    recipientId: string;
    amount: string;
    status: GiftStatus;
    link: string;
    note: string;
}

export const GiftForm = ({
    gift,
    recipientId,
    recipients,
    onDone,
}: GiftFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.gifts.createGift.useMutation();
    const update = trpc.gifts.updateGift.useMutation();
    const remove = trpc.gifts.removeGift.useMutation();
    const money = useMoney();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<GiftFormValues>({
        defaultValues: {
            name: gift?.name ?? "",
            recipientId,
            amount: moneyInput(gift?.amount ?? null, money.decimalPlaces),
            status: (gift?.status as GiftStatus | undefined) ?? "idea",
            link: gift?.link ?? "",
            note: gift?.note ?? "",
        },
    });

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const fields = {
            name,
            recipientId: values.recipientId,
            amount: parseOptionalMoney(values.amount, money.decimalPlaces) ?? 0,
            status: values.status,
            link: values.link.trim() || null,
            note: values.note.trim() || null,
        };

        try {
            if (gift) {
                await update.mutateAsync({
                    id: gift.id,
                    expectedUpdatedAt: gift.updatedAt,
                    ...fields,
                });
            } else {
                await create.mutateAsync(fields);
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.gifts.invalidate();
        notifySuccess(gift ? `Saved ${name}.` : `Added ${name}.`);
        onDone();
    });

    const handleRemove = async () => {
        if (!gift) return;
        try {
            await remove.mutateAsync({ id: gift.id });
        } catch {
            return;
        }
        await utils.gifts.invalidate();
        notifySuccess(`Deleted ${gift.name}.`);
        onDone();
    };

    const recipientOptions = recipients.map((recipient) => ({
        value: recipient.id,
        label: recipient.name,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Gift"
                    placeholder="e.g. Cashmere scarf"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter what it is.",
                    })}
                />
                <FormChoiceField
                    control={control}
                    name="recipientId"
                    label="For"
                    options={recipientOptions}
                />
                <div className="grid grid-cols-2 gap-3">
                    <TextField
                        label="Price"
                        placeholder="0.00"
                        inputMode="decimal"
                        prefix={money.symbol}
                        error={errors.amount?.message}
                        {...register("amount", {
                            validate: (value) => validMoney(value, true),
                        })}
                    />
                    <FormChoiceField
                        control={control}
                        name="status"
                        label="Status"
                        options={STATUS_OPTIONS}
                    />
                </div>
                <TextField
                    label="Where from"
                    placeholder="Shop or link, optional"
                    {...register("link")}
                />
                <TextField
                    label="Note"
                    placeholder="Optional"
                    {...register("note")}
                />
            </div>

            <FormFooter
                aside={
                    gift && (
                        <ArchiveAction
                            label="Delete gift"
                            consequence="Removes it from the list and the totals."
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
                    {gift ? "Save changes" : "Add gift"}
                </Button>
            </FormFooter>
        </form>
    );
};
