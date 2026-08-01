import { useState } from "react";
import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { trpc } from "@/trpc";
import type { Category } from "../../../../server/db/schema";

export interface CategoryEditModalProps {
    category: Category;
    opened: boolean;
    onClose: () => void;
    /** Hands the archive back to the row, which owns the confirmation step —
     *  a confirm dialog stacked on this one is a modal on top of a modal. */
    onArchive: () => void;
}

/** The touch version of renaming a category. Desktop edits the row in place;
 *  a phone can't fit a field, Save and Cancel on one line, so it gets a sheet
 *  with room for the destructive action too. */
export const CategoryEditModal = ({
    category,
    opened,
    onClose,
    onArchive,
}: CategoryEditModalProps) => {
    const utils = trpc.useUtils();
    const update = trpc.categories.update.useMutation();
    const [name, setName] = useState(category.name);
    const [error, setError] = useState("");

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) return setError("Please enter a name.");
        if (trimmed !== category.name) {
            await update.mutateAsync({
                id: category.id,
                expectedUpdatedAt: category.updatedAt,
                name: trimmed,
            });
            await utils.categories.list.invalidate();
        }
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Edit category"
            size="sm"
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                }}
            >
                <Stack gap="md">
                    <TextInput
                        label="Name"
                        value={name}
                        onChange={(e) => {
                            setName(e.currentTarget.value);
                            setError("");
                        }}
                        error={error || (update.error?.message ?? undefined)}
                        data-autofocus
                    />
                    <Group justify="space-between">
                        <Button
                            type="button"
                            variant="subtle"
                            color="red"
                            onClick={onArchive}
                        >
                            Archive
                        </Button>
                        <Group gap="xs">
                            <Button
                                type="button"
                                variant="default"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={update.isPending}>
                                Save
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
