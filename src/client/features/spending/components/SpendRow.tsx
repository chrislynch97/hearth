import { type MoneyFormat, useFormatDate } from "@/useMoney";
import type {
    Category,
    Member,
    Pot,
    SpendTransaction,
} from "../../../../server/db/schema";
import { trpc } from "@/trpc";
import { useState } from "react";
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Modal,
    Stack,
    Table,
    Text,
} from "@mantine/core";
import { EditSpendModal } from "@/features/spending/components/EditSpendModal";
import { SplitModal } from "./SplitModal";
import { AssignPotCell } from "@/features/spending/components/AssignPotCell";
import { formatMoney } from "@shared/money";

export interface SpendRowProps {
    spend: SpendTransaction;
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    categories: Category[];
}

export const SpendRow = ({
    spend,
    members,
    pots,
    money,
    categories,
}: SpendRowProps) => {
    const utils = trpc.useUtils();
    const fmt = useFormatDate();
    const remove = trpc.spends.remove.useMutation();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [splitOpen, setSplitOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

    const owner = members.find((m) => m.id === spend.ownerId);
    const pot = spend.potId ? pots.find((p) => p.id === spend.potId) : null;
    const isRefund = spend.amount < 0;
    // No pot + settled = a main-account spend (not "needs a pot").
    const isMainAccount = !spend.potId && spend.settledAtSource === 1;
    const categoryName = spend.categoryId
        ? categories.find((c) => c.id === spend.categoryId)?.name
        : null;

    async function handleDelete() {
        await remove.mutateAsync({ id: spend.id });
        await Promise.all([
            utils.spends.list.invalidate(),
            utils.reconcile.backlog.invalidate(),
        ]);
        setConfirmDelete(false);
    }

    return (
        <>
            <Table.Tr>
                <Table.Td style={{ whiteSpace: "nowrap" }}>
                    {fmt(spend.date)}
                </Table.Td>
                <Table.Td>
                    <Group gap={6} wrap="nowrap">
                        {spend.description}
                        {spend.splitGroupId && (
                            <Badge size="xs" variant="light" color="gray">
                                split
                            </Badge>
                        )}
                    </Group>
                </Table.Td>
                <Table.Td>{owner?.displayName ?? spend.ownerId}</Table.Td>
                <Table.Td>
                    <Text
                        c={isRefund ? "moss" : undefined}
                        fw={isRefund ? 600 : undefined}
                    >
                        {isRefund ? "+" : ""}
                        {formatMoney(Math.abs(spend.amount), money)}
                    </Text>
                </Table.Td>
                <Table.Td>
                    {pot ? (
                        <Text size="sm">{pot.name}</Text>
                    ) : isMainAccount ? (
                        <Text size="sm" c="dimmed">
                            Main account
                            {categoryName ? ` · ${categoryName}` : ""}
                        </Text>
                    ) : (
                        <Group gap="xs" wrap="nowrap">
                            <Badge size="sm" color="apricot" variant="light">
                                Needs a pot
                            </Badge>
                            <AssignPotCell spend={spend} pots={pots} />
                        </Group>
                    )}
                </Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>
                    {spend.reconciled === 1 ? (
                        <Badge
                            size="sm"
                            color="moss"
                            variant="light"
                            styles={{
                                root: { maxWidth: "none" },
                                label: { overflow: "visible" },
                            }}
                        >
                            Reconciled
                        </Badge>
                    ) : spend.settledAtSource === 1 ? (
                        <Badge
                            size="sm"
                            color="teal"
                            variant="light"
                            styles={{
                                root: { maxWidth: "none" },
                                label: { overflow: "visible" },
                            }}
                        >
                            Settled
                        </Badge>
                    ) : (
                        <Badge
                            size="sm"
                            color="sand"
                            variant="light"
                            styles={{
                                root: { maxWidth: "none" },
                                label: { overflow: "visible" },
                            }}
                        >
                            Pending
                        </Badge>
                    )}
                </Table.Td>
                <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                        {spend.reconciled === 0 && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                aria-label={`Edit ${spend.description}`}
                                onClick={() => setEditOpen(true)}
                            >
                                Edit
                            </Button>
                        )}
                        {spend.reconciled === 0 && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                aria-label={`Split ${spend.description}`}
                                onClick={() => setSplitOpen(true)}
                            >
                                Split
                            </Button>
                        )}
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            aria-label={`Delete ${spend.description}`}
                            onClick={() => setConfirmDelete(true)}
                        >
                            ×
                        </ActionIcon>
                    </Group>
                </Table.Td>
            </Table.Tr>
            {editOpen && (
                <EditSpendModal
                    spend={spend}
                    members={members}
                    pots={pots}
                    money={money}
                    opened={editOpen}
                    onClose={() => setEditOpen(false)}
                />
            )}
            {splitOpen && (
                <SplitModal
                    spend={spend}
                    members={members}
                    pots={pots}
                    money={money}
                    opened={splitOpen}
                    onClose={() => setSplitOpen(false)}
                />
            )}
            <Modal
                opened={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title="Delete transaction?"
                size="sm"
            >
                <Stack gap="md">
                    <Text size="sm">
                        Delete <strong>{spend.description}</strong>? This can't
                        be undone.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setConfirmDelete(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            onClick={() => void handleDelete()}
                            loading={remove.isPending}
                        >
                            Delete
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
