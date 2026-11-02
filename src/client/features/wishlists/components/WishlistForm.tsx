import { trpc } from "@/trpc";
import { ListForm } from "@/components/ui/ListForm";
import type { WishlistSummary } from "@/features/wishlists/model";

export interface WishlistFormProps {
    /** Absent when adding. */
    list: WishlistSummary | undefined;
    onCreated: (slug: string) => void;
    onDone: () => void;
}

export const WishlistForm = ({
    list,
    onCreated,
    onDone,
}: WishlistFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.wishlists.create.useMutation();
    const update = trpc.wishlists.update.useMutation();

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
        await utils.wishlists.invalidate();

        return slug;
    };

    const setArchived = async (archived: boolean) => {
        if (!list) return;
        await update.mutateAsync({
            id: list.id,
            expectedUpdatedAt: list.updatedAt,
            archived,
        });
        await utils.wishlists.invalidate();
    };

    return (
        <ListForm
            list={list}
            placeholder="e.g. Kitchen"
            archiveConsequence="Tucks the list away. Its items stay under All."
            save={save}
            setArchived={setArchived}
            onCreated={onCreated}
            onDone={onDone}
        />
    );
};
