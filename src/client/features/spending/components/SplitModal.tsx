import type { MoneyFormat } from "@/useMoney";
import type {
    Member,
    Pot,
    SpendTransaction,
} from "../../../../server/db/schema";
import { trpc } from "@/trpc";
import { groupedPotOptions, orderMembers } from "@/potOptions";
import { allocate, formatMoney, fromMinor, toMinor } from "@shared/money";
import { useState } from "react";
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Text,
} from "@mantine/core";

interface SplitPart {
    amountMajor: number | string;
    ownerId: string;
    potId: string | null;
}

export interface SplitModalProps {
    spend: SpendTransaction;
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    opened: boolean;
    onClose: () => void;
}

export const SplitModal = ({
    spend,
    members,
    pots,
    money,
    opened,
    onClose,
}: SplitModalProps) => {
    const utils = trpc.useUtils();
    const split = trpc.spends.split.useMutation();
    const orderedMembers = orderMembers(members);
    const sign = spend.amount < 0 ? -1 : 1;
    const totalMinor = Math.abs(spend.amount);

    // Default: an even two-way split so the remainder starts at zero.
    const even = allocate(totalMinor, [1, 1]);
    const [parts, setParts] = useState<SplitPart[]>([
        {
            amountMajor: fromMinor(even[0]!, money.decimalPlaces),
            ownerId: spend.ownerId,
            potId: spend.potId,
        },
        {
            amountMajor: fromMinor(even[1]!, money.decimalPlaces),
            ownerId: spend.ownerId,
            potId: spend.potId,
        },
    ]);
    const [error, setError] = useState("");

    function update(i: number, patch: Partial<SplitPart>) {
        setParts((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
        );
    }
    function addRow() {
        setParts((prev) => [
            ...prev,
            { amountMajor: "", ownerId: spend.ownerId, potId: null },
        ]);
    }
    function removeRow(i: number) {
        setParts((prev) =>
            prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)
        );
    }
    function splitEvenly() {
        const amounts = allocate(
            totalMinor,
            parts.map(() => 1)
        );
        setParts((prev) =>
            prev.map((p, i) => ({
                ...p,
                amountMajor: fromMinor(amounts[i]!, money.decimalPlaces),
            }))
        );
    }

    const partMinors = parts.map((p) =>
        p.amountMajor === ""
            ? 0
            : toMinor(Number(p.amountMajor), money.decimalPlaces)
    );
    const sumMinor = partMinors.reduce((a, b) => a + b, 0);
    const remainderMinor = totalMinor - sumMinor;
    const allValid = parts.every((p, i) => p.ownerId && partMinors[i]! > 0);
    const canSave = remainderMinor === 0 && allValid && !split.isPending;

    async function handleSave() {
        if (!canSave) return;
        setError("");
        try {
            await split.mutateAsync({
                id: spend.id,
                parts: parts.map((p, i) => ({
                    amount: sign * partMinors[i]!,
                    ownerId: p.ownerId,
                    potId: p.potId,
                })),
            });
            await Promise.all([
                utils.spends.list.invalidate(),
                utils.reconcile.backlog.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not split this spend."
            );
        }
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Split "${spend.description}"`}
            size="lg"
        >
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Divide {formatMoney(totalMinor, money)} across pots and
                    people. The parts must add up to the total.
                </Text>
                {parts.map((p, i) => (
                    <Group key={i} align="flex-end" gap="xs" wrap="nowrap">
                        <NumberInput
                            label={i === 0 ? "Amount" : undefined}
                            placeholder="0.00"
                            decimalScale={money.decimalPlaces}
                            fixedDecimalScale
                            min={0}
                            w={120}
                            leftSection={<Text size="sm">{money.symbol}</Text>}
                            value={p.amountMajor}
                            onChange={(v) => update(i, { amountMajor: v })}
                        />
                        <Select
                            label={i === 0 ? "Who paid" : undefined}
                            data={orderedMembers.map((m) => ({
                                value: m.id,
                                label: m.displayName,
                            }))}
                            value={p.ownerId}
                            onChange={(v) =>
                                update(i, { ownerId: v ?? p.ownerId })
                            }
                            allowDeselect={false}
                            w={130}
                        />
                        <Select
                            label={i === 0 ? "Pot" : undefined}
                            placeholder="No pot (assign later)"
                            data={groupedPotOptions(pots, members)}
                            value={p.potId}
                            searchable
                            clearable
                            onChange={(v) => update(i, { potId: v || null })}
                            style={{ flex: 1 }}
                        />
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            size="lg"
                            aria-label="Remove row"
                            disabled={parts.length <= 2}
                            onClick={() => removeRow(i)}
                        >
                            ×
                        </ActionIcon>
                    </Group>
                ))}

                <Group justify="space-between">
                    <Group gap="xs">
                        <Button size="xs" variant="default" onClick={addRow}>
                            + Add row
                        </Button>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={splitEvenly}
                        >
                            Split evenly
                        </Button>
                    </Group>
                    <Text
                        size="sm"
                        c={remainderMinor === 0 ? "moss" : "red"}
                        fw={600}
                    >
                        {remainderMinor === 0
                            ? "Balanced ✓"
                            : `Remaining ${formatMoney(remainderMinor, money)}`}
                    </Text>
                </Group>

                {(error || split.error) && (
                    <Alert color="red" title="Error">
                        {error || split.error?.message}
                    </Alert>
                )}

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSave()}
                        disabled={!canSave}
                        loading={split.isPending}
                    >
                        Save split
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
