import { trpc } from "@/trpc";
import { ListForm } from "@/components/ui/ListForm";
import type { TodoListSummary } from "@/features/todos/model";

export interface TodoListFormProps {
    /** Absent when adding. */
    list: TodoListSummary | undefined;
    onCreated: (slug: string) => void;
    onDone: () => void;
}

export const TodoListForm = ({
    list,
    onCreated,
    onDone,
}: TodoListFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.todoLists.create.useMutation();
    const update = trpc.todoLists.update.useMutation();

    const save = async (name: string) => {
        let slug: string | undefined;
        if (list) {
            await update.mutateAsync({
                id: list.id,
                expectedUpdatedAt: list.updatedAt,
                name,
            });
        } else {
            slug = (await create.mutateAsync({ name })).slug;
        }
        await utils.todoLists.invalidate();

        return slug;
    };

    const setArchived = async (archived: boolean) => {
        if (!list) return;
        await update.mutateAsync({
            id: list.id,
            expectedUpdatedAt: list.updatedAt,
            archived,
        });
        await utils.todoLists.invalidate();
    };

    return (
        <ListForm
            list={list}
            placeholder="e.g. Wedding"
            archiveConsequence="Tucks the list away. Its to-dos stay under All."
            save={save}
            setArchived={setArchived}
            onCreated={onCreated}
            onDone={onDone}
        />
    );
};
