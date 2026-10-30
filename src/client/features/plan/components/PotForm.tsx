import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { parseRate, rateInput, validRate } from "@/interestRate";
import { orderMembers } from "@/potOptions";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
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
    rate: string;
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
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<PotFormValues>({
        defaultValues: {
            name: pot?.name ?? "",
            ownerId: pot?.ownerId ?? "",
            categoryId: pot?.categoryId ?? defaultCategoryId ?? "",
            note: pot?.note ?? "",
            rate: rateInput(pot?.interestRateBp ?? null),
        },
    });

    // A rate changes what the pot's savings planner projects.
    const refresh = () =>
        Promise.all([
            utils.pots.list.invalidate(),
            utils.plan.funding.invalidate(),
            utils.standingOrders.alerts.invalidate(),
            utils.savings.invalidate(),
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
                    interestRateBp: parseRate(values.rate),
                });
            } else {
                await create.mutateAsync({
                    name,
                    ownerId: values.ownerId,
                    categoryId,
                    note: values.note.trim() || undefined,
                    interestRateBp: parseRate(values.rate),
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
                <FormChoiceField
                    control={control}
                    name="ownerId"
                    rules={{ required: "Choose who this pot belongs to." }}
                    label="Owner"
                    placeholder="Choose an owner"
                    options={memberOptions}
                    error={errors.ownerId?.message}
                />
                <FormChoiceField
                    control={control}
                    name="categoryId"
                    label="Category"
                    emptyLabel="Uncategorised"
                    options={categoryOptions}
                />
                <TextField
                    label="Interest rate (AER %)"
                    description="Used by the pot's savings planner; elsewhere it's for reference."
                    placeholder="Optional"
                    inputMode="decimal"
                    error={errors.rate?.message}
                    {...register("rate", { validate: validRate })}
                />
                <TextField
                    label="Note"
                    placeholder="Optional"
                    {...register("note")}
                />
            </div>

            <div className="mt-5 flex justify-end">
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
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
