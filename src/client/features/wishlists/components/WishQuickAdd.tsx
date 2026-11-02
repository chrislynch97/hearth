import { useState, type FormEvent } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { TextField } from "@/components/ui/TextField";

export interface WishQuickAddProps {
    /** Where it lands: the list on screen, with whatever is being filtered on,
     *  so a new item doesn't vanish behind the filter it was added under. */
    listId: string | undefined;
    listName: string | undefined;
    tags: string[];
    wantedById: string | undefined;
}

/** A name is all an item needs. Tap it afterwards for the price and link. */
export const WishQuickAdd = ({
    listId,
    listName,
    tags,
    wantedById,
}: WishQuickAddProps) => {
    const utils = trpc.useUtils();
    const create = trpc.wishlistItems.create.useMutation();

    const [name, setName] = useState("");

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;

        try {
            await create.mutateAsync({
                name: trimmed,
                listId,
                tags,
                wantedById,
            });
        } catch {
            return; // surfaced by the global error handler; keep what was typed
        }
        setName("");
        await Promise.all([
            utils.wishlistItems.invalidate(),
            utils.wishlists.invalidate(),
        ]);
    };

    return (
        <form
            className="flex items-end gap-2"
            onSubmit={(event) => void submit(event)}
        >
            <TextField
                label="What do you want"
                hideLabel
                placeholder={
                    listName ? `Add to ${listName}` : "What do you want?"
                }
                value={name}
                className="min-w-0 flex-1"
                onChange={(event) => setName(event.target.value)}
            />
            <Button
                variant="solid"
                type="submit"
                icon={<PlusIcon />}
                className="h-9 shrink-0"
                disabled={create.isPending || !name.trim()}
            >
                Add
            </Button>
        </form>
    );
};
