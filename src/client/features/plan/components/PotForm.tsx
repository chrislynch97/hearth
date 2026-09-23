import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { orderMembers } from "@/potOptions";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/features/plan/components/ArchiveAction";
import type { Category, Member, Pot } from "../../../../server/db/schema";

export interface PotFormProps {
    /** Absent when adding. */
    pot: Pot | undefined;
    members: Member[];
    categories: Category[];
    /** Preselected when adding from inside a category. */
    defaultCategoryId: string | null;
    onDone: () => void;
}

interface PotFormValues {
    name: string;
    ownerId: string;
    categoryId: string;
    note: string;
}

/** The pot itself — what it is called, whose it is, where it sits. What goes
 *  into it is its own form: see SetAsideForm. */
export const PotForm = ({
    pot,
    members,
    categories,
    defaultCategoryId,
    onDone,
}: PotFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.pots.create.useMutation();
    const update = trpc.pots.update.useMutation();
    const archive = trpc.pots.archive.useMutation();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<PotFormValues>({
        defaultValues: {
            name: pot?.name ?? "",
            ownerId: pot?.ownerId ?? "",
            categoryId: pot?.categoryId ?? defaultCategoryId ?? "",
            note: pot?.note ?? "",
        },
    });

    const refresh = () =>
        Promise.all([
            utils.pots.list.invalidate(),
            utils.plan.funding.invalidate(),
            utils.standingOrders.alerts.invalidate(),
        ]);

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const categoryId = values.categoryId || null;

        try {
            if (pot) {
                await update.mutateAsync({
                    id: pot.id,
                    expectedUpdatedAt: pot.updatedAt,
                    name,
                    ownerId: values.ownerId,
                    categoryId,
                    note: values.note.trim(),
                });
            } else {
                await create.mutateAsync({
                    name,
                    ownerId: values.ownerId,
                    categoryId,
                    note: values.note.trim() || undefined,
                });
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await refresh();
        notifySuccess(pot ? `Saved ${name}.` : `Added ${name}.`);
        onDone();
    });

    const handleArchive = async () => {
        if (!pot) return;
        try {
            await archive.mutateAsync({ id: pot.id });
        } catch {
            return;
        }
        await refresh();
        notifySuccess(`Archived ${pot.name}.`);
        onDone();
    };

    const memberOptions = orderMembers(members).map((member) => ({
        value: member.id,
        label: member.displayName,
    }));
    const categoryOptions = categories.map((category) => ({
        value: category.id,
        label: category.name,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. Holiday fund"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter a pot name.",
                    })}
                />
                <SelectField
                    label="Owner"
                    placeholder="Choose an owner"
                    options={memberOptions}
                    error={errors.ownerId?.message}
                    {...register("ownerId", {
                        required: "Choose who this pot belongs to.",
                    })}
                />
                <SelectField
                    label="Category"
                    placeholder="Uncategorised"
                    options={categoryOptions}
                    {...register("categoryId")}
                />
                <TextField
                    label="Note"
                    placeholder="Optional"
                    {...register("note")}
                />
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {pot ? "Save changes" : "Add pot"}
                </Button>
            </div>

            {pot && (
                <ArchiveAction
                    label="Archive pot"
                    consequence="Bills pointing at it keep their history, but stop being funded. Nothing is deleted."
                    pending={archive.isPending}
                    onArchive={() => void handleArchive()}
                />
            )}
        </form>
    );
};
