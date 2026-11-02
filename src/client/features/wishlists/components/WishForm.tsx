import { useState } from "react";
import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { FormFooter } from "@/components/ui/FormFooter";
import { TagPicker } from "@/components/ui/TagPicker";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import {
    moneyInput,
    parseOptionalMoney,
    validMoney,
} from "@/features/gifts/model";
import {
    PRIORITY_OPTIONS,
    type WishlistItemWithTags,
    type WishlistSummary,
} from "@/features/wishlists/model";
import type { Priority } from "@shared/priority";

export interface WishFormProps {
    item: WishlistItemWithTags;
    lists: WishlistSummary[];
    members: Array<{ id: string; displayName: string }>;
    /** Every tag the household is using. */
    tags: string[];
    onDone: () => void;
}

interface WishFormValues {
    name: string;
    listId: string;
    wantedById: string;
    price: string;
    priority: Priority;
    link: string;
    notes: string;
}

export const WishForm = ({
    item,
    lists,
    members,
    tags,
    onDone,
}: WishFormProps) => {
    const utils = trpc.useUtils();
    const update = trpc.wishlistItems.update.useMutation();
    const archive = trpc.wishlistItems.archive.useMutation();
    const money = useMoney();

    const [pickedTags, setPickedTags] = useState(item.tags);
    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<WishFormValues>({
        defaultValues: {
            name: item.name,
            listId: item.listId ?? "",
            wantedById: item.wantedById ?? "",
            price: moneyInput(item.price, money.decimalPlaces),
            priority: item.priority as Priority,
            link: item.link ?? "",
            notes: item.notes ?? "",
        },
    });

    const refresh = async () => {
        await Promise.all([
            utils.wishlistItems.invalidate(),
            utils.wishlists.invalidate(),
        ]);
    };

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();

        try {
            await update.mutateAsync({
                id: item.id,
                expectedUpdatedAt: item.updatedAt,
                name,
                listId: values.listId || null,
                wantedById: values.wantedById || null,
                price: parseOptionalMoney(values.price, money.decimalPlaces),
                priority: values.priority,
                link: values.link.trim() || null,
                notes: values.notes.trim() || null,
                tags: pickedTags,
            });
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await refresh();
        notifySuccess(`Saved ${name}.`);
        onDone();
    });

    const handleArchive = async () => {
        try {
            await archive.mutateAsync({ id: item.id });
        } catch {
            return;
        }
        await refresh();
        notifySuccess(`Deleted ${item.name}.`);
        onDone();
    };

    const listOptions = lists
        .filter((list) => list.archivedAt === null || list.id === item.listId)
        .map((list) => ({ value: list.id, label: list.name }));
    const memberOptions = members.map((member) => ({
        value: member.id,
        label: member.displayName,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Item"
                    placeholder="e.g. Stand mixer"
                    error={errors.name?.message}
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter what it is.",
                    })}
                />
                <div className="grid grid-cols-2 gap-3">
                    <TextField
                        label="Price"
                        placeholder="Optional"
                        inputMode="decimal"
                        prefix={money.symbol}
                        error={errors.price?.message}
                        {...register("price", {
                            validate: (value) => validMoney(value, false),
                        })}
                    />
                    <FormChoiceField
                        control={control}
                        name="priority"
                        label="How much"
                        options={PRIORITY_OPTIONS}
                    />
                    <FormChoiceField
                        control={control}
                        name="wantedById"
                        label="Who wants it"
                        emptyLabel="Anyone"
                        options={memberOptions}
                    />
                    <FormChoiceField
                        control={control}
                        name="listId"
                        label="List"
                        emptyLabel="No list"
                        options={listOptions}
                    />
                </div>
                <TextField
                    label="Where from"
                    placeholder="Shop or link, optional"
                    {...register("link")}
                />
                <TagPicker
                    tags={tags}
                    value={pickedTags}
                    onChange={setPickedTags}
                />
                <TextAreaField
                    label="Notes"
                    placeholder="Optional"
                    {...register("notes")}
                />
            </div>

            <FormFooter
                aside={
                    <ArchiveAction
                        label="Delete item"
                        consequence="Takes it off the list."
                        pending={archive.isPending}
                        onArchive={() => void handleArchive()}
                    />
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    Save changes
                </Button>
            </FormFooter>
        </form>
    );
};
