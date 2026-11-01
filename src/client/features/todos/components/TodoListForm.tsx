import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextField } from "@/components/ui/TextField";
import type { TodoListSummary } from "@/features/todos/model";

export interface TodoListFormProps {
    /** Absent when adding. */
    list: TodoListSummary | undefined;
    onCreated: (slug: string) => void;
    onDone: () => void;
}

interface TodoListFormValues {
    name: string;
}

export const TodoListForm = ({
    list,
    onCreated,
    onDone,
}: TodoListFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.todoLists.create.useMutation();
    const update = trpc.todoLists.update.useMutation();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<TodoListFormValues>({
        defaultValues: { name: list?.name ?? "" },
    });

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        let createdSlug: string | undefined;

        try {
            if (list) {
                await update.mutateAsync({
                    id: list.id,
                    expectedUpdatedAt: list.updatedAt,
                    name,
                });
            } else {
                createdSlug = (await create.mutateAsync({ name })).slug;
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.todoLists.invalidate();
        notifySuccess(list ? `Saved ${name}.` : `Added ${name}.`);
        if (createdSlug) onCreated(createdSlug);
        onDone();
    });

    const setArchived = async (archived: boolean) => {
        if (!list) return;
        try {
            await update.mutateAsync({
                id: list.id,
                expectedUpdatedAt: list.updatedAt,
                archived,
            });
        } catch {
            return;
        }
        await utils.todoLists.invalidate();
        notifySuccess(
            archived ? `Archived ${list.name}.` : `Restored ${list.name}.`
        );
        onDone();
    };

    const archived = list?.archivedAt != null;

    return (
        <form onSubmit={submit}>
            <TextField
                label="Name"
                placeholder="e.g. Wedding"
                error={errors.name?.message}
                autoFocus
                {...register("name", {
                    validate: (value) =>
                        value.trim().length > 0 || "Give the list a name.",
                })}
            />

            <FormFooter
                aside={
                    list &&
                    (archived ? (
                        <Button
                            className="max-sm:h-9"
                            disabled={update.isPending}
                            onClick={() => void setArchived(false)}
                        >
                            Restore list
                        </Button>
                    ) : (
                        <ArchiveAction
                            label="Archive list"
                            consequence="Tucks the list away. Its to-dos stay under All."
                            pending={update.isPending}
                            onArchive={() => void setArchived(true)}
                        />
                    ))
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {list ? "Save changes" : "Add list"}
                </Button>
            </FormFooter>
        </form>
    );
};
