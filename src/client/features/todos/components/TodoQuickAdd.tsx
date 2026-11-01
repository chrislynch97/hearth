import { useState, type FormEvent } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { TextField } from "@/components/ui/TextField";

export interface TodoQuickAddProps {
    /** Where it lands: the list on screen, with whatever is being filtered on,
     *  so a new to-do doesn't vanish behind the filter it was added under. */
    listId: string | undefined;
    listName: string | undefined;
    tags: string[];
    assigneeId: string | undefined;
}

/** A title is all a to-do needs. Tap it afterwards for the rest. */
export const TodoQuickAdd = ({
    listId,
    listName,
    tags,
    assigneeId,
}: TodoQuickAddProps) => {
    const utils = trpc.useUtils();
    const create = trpc.todos.create.useMutation();

    const [title, setTitle] = useState("");

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;

        try {
            await create.mutateAsync({
                title: trimmed,
                listId,
                tags,
                assigneeId,
            });
        } catch {
            return; // surfaced by the global error handler; keep what was typed
        }
        setTitle("");
        await Promise.all([
            utils.todos.invalidate(),
            utils.todoLists.invalidate(),
        ]);
    };

    return (
        <form
            className="flex items-end gap-2"
            onSubmit={(event) => void submit(event)}
        >
            <TextField
                label="What needs doing"
                hideLabel
                placeholder={
                    listName ? `Add to ${listName}` : "What needs doing?"
                }
                value={title}
                className="min-w-0 flex-1"
                onChange={(event) => setTitle(event.target.value)}
            />
            <Button
                variant="solid"
                type="submit"
                icon={<PlusIcon />}
                className="h-9 shrink-0"
                disabled={create.isPending || !title.trim()}
            >
                Add
            </Button>
        </form>
    );
};
