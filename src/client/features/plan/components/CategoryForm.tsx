import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/features/plan/components/ArchiveAction";
import type { Category } from "../../../../server/db/schema";

export interface CategoryFormProps {
    /** Absent when adding. */
    category: Category | undefined;
    /** How many pots would be left uncategorised by archiving this one. */
    potCount: number;
    /** A new category, once it exists — the page moves to it. */
    onCreated: (categoryId: string) => void;
    onDone: () => void;
}

interface CategoryFormValues {
    name: string;
}

export const CategoryForm = ({
    category,
    potCount,
    onCreated,
    onDone,
}: CategoryFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.categories.create.useMutation();
    const update = trpc.categories.update.useMutation();
    const archive = trpc.categories.archive.useMutation();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<CategoryFormValues>({
        defaultValues: { name: category?.name ?? "" },
    });

    const refresh = () =>
        Promise.all([
            utils.categories.list.invalidate(),
            utils.pots.list.invalidate(),
            utils.expenses.list.invalidate(),
        ]);

    const submit = handleSubmit(async ({ name }) => {
        const trimmed = name.trim();
        let createdId: string | undefined;
        try {
            if (category) {
                await update.mutateAsync({
                    id: category.id,
                    expectedUpdatedAt: category.updatedAt,
                    name: trimmed,
                });
            } else {
                createdId = (await create.mutateAsync({ name: trimmed })).id;
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        // After the refetch, so the page already knows the category it is
        // about to select.
        await refresh();
        notifySuccess(category ? `Saved ${trimmed}.` : `Added ${trimmed}.`);
        if (createdId) onCreated(createdId);
        onDone();
    });

    const handleArchive = async () => {
        if (!category) return;
        try {
            await archive.mutateAsync({ id: category.id });
        } catch {
            return;
        }
        await refresh();
        notifySuccess(`Archived ${category.name}.`);
        onDone();
    };

    return (
        <form onSubmit={submit}>
            <TextField
                label="Name"
                placeholder="e.g. Household"
                description="Groups pots and main-account bills across the household."
                error={errors.name?.message}
                autoFocus
                {...register("name", {
                    required: "Enter a name.",
                    validate: (value) =>
                        value.trim().length > 0 || "Enter a name.",
                })}
            />
            <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {category ? "Save changes" : "Add category"}
                </Button>
            </div>
            {category && (
                <ArchiveAction
                    label="Archive category"
                    consequence={
                        potCount === 0
                            ? "Nothing is using it. Nothing is deleted."
                            : `Its ${potCount} pot${potCount === 1 ? "" : "s"} become uncategorised. Nothing is deleted.`
                    }
                    pending={archive.isPending}
                    onArchive={() => void handleArchive()}
                />
            )}
        </form>
    );
};
