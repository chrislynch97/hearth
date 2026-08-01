import type { CSSProperties, ReactNode } from "react";
import { ActionIcon, Group, Text, UnstyledButton } from "@mantine/core";
import { useIsMobile } from "@/useIsMobile";

export interface EditableListRowProps {
    /** The row's own content — laid out by the caller, since only it knows what
     *  reads well when the action icons aren't taking up the end of the row. */
    children: ReactNode;
    /** Opens the editor: the ✎ icon on desktop, the whole row on touch. */
    onEdit: () => void;
    /** Desktop's destructive icon. On touch this belongs *inside* the editor —
     *  a ×  next to a full-width tap target is far too easy to catch by accident. */
    onDelete: () => void;
    editLabel: string;
    deleteLabel: string;
    style?: CSSProperties;
}

/** A list row you can edit or remove, in the two shapes those actions want.
 *
 *  Desktop keeps the hover-scale ✎ / × pair. Touch makes the whole row one
 *  target that opens the editor, because a 28px icon button between two other
 *  28px icon buttons is not a phone control — and long-press isn't an option
 *  either: iOS claims it for text selection and nothing advertises it. */
export const EditableListRow = ({
    children,
    onEdit,
    onDelete,
    editLabel,
    deleteLabel,
    style,
}: EditableListRowProps) => {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <UnstyledButton
                onClick={onEdit}
                aria-label={editLabel}
                px="xs"
                py="sm"
                style={{ borderRadius: 6, ...style }}
            >
                <Group justify="space-between" gap="sm" wrap="nowrap">
                    <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
                    <Text c="dimmed" aria-hidden>
                        ›
                    </Text>
                </Group>
            </UnstyledButton>
        );
    }

    return (
        <Group
            justify="space-between"
            px="xs"
            py={6}
            wrap="nowrap"
            style={{ borderRadius: 6, ...style }}
        >
            <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
            <Group gap={4} wrap="nowrap">
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={editLabel}
                    onClick={onEdit}
                >
                    ✎
                </ActionIcon>
                <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label={deleteLabel}
                    onClick={onDelete}
                >
                    ×
                </ActionIcon>
            </Group>
        </Group>
    );
};
