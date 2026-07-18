import { trpc } from "@/trpc";
import {
    ActionIcon,
    Alert,
    Button,
    Center,
    Group,
    Loader,
    Modal,
    NumberInput,
    Stack,
    Table,
    Text,
    TextInput,
} from "@mantine/core";
import { useState } from "react";
import { formatMoney, toMinor } from "@shared/money";
import type { AccountWithValue } from "../../../../server/routers/accounts";
import {
    formatSignedPercent,
    type MoneyFormat,
    useFormatDate,
} from "@/useMoney";
import { hearthTokens } from "@/theme";
import { today } from "@/features/accounts/util";

export interface BalancesModalProps {
    opened: boolean;
    onClose: () => void;
    account: AccountWithValue;
    money: MoneyFormat;
}

export const BalancesModal = ({
    opened,
    onClose,
    account,
    money,
}: BalancesModalProps) => {
    const utils = trpc.useUtils();
    const fmt = useFormatDate();
    const balancesQuery = trpc.accounts.balances.useQuery(
        { accountId: account.id },
        { enabled: opened }
    );
    const addBalance = trpc.accounts.addBalance.useMutation();
    const removeBalance = trpc.accounts.removeBalance.useMutation();

    const [asOfDate, setAsOfDate] = useState(today());
    const [valueMajor, setValueMajor] = useState<number | string>("");
    const [error, setError] = useState("");

    const ascending = balancesQuery.data ?? [];
    const balances = [...ascending].reverse(); // newest first for display
    // Change vs the previous (older) snapshot, keyed by balance id.
    const deltaById = new Map<string, { delta: number; pct: number | null }>();
    ascending.forEach((b, i) => {
        const prev = ascending[i - 1];
        if (!prev) return;
        const delta = b.value - prev.value;
        deltaById.set(b.id, {
            delta,
            pct: prev.value !== 0 ? (delta / prev.value) * 100 : null,
        });
    });

    async function refresh() {
        await Promise.all([
            utils.accounts.balances.invalidate({ accountId: account.id }),
            utils.accounts.list.invalidate(),
            utils.accounts.summary.invalidate(),
        ]);
    }

    async function handleAdd() {
        if (!asOfDate) return setError("Choose a date.");
        if (valueMajor === "" || Number.isNaN(Number(valueMajor)))
            return setError("Enter the balance.");
        setError("");
        await addBalance.mutateAsync({
            accountId: account.id,
            asOfDate,
            value: toMinor(Number(valueMajor), money.decimalPlaces),
        });
        setValueMajor("");
        await refresh();
    }

    async function handleRemove(id: string) {
        await removeBalance.mutateAsync({ id });
        await refresh();
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`${account.name} — balances`}
            size="lg"
        >
            <Stack gap="md">
                <Group
                    align="flex-end"
                    gap="sm"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAdd();
                        }
                    }}
                >
                    <TextInput
                        label="As of"
                        type="date"
                        data-autofocus
                        value={asOfDate}
                        onChange={(e) => setAsOfDate(e.currentTarget.value)}
                    />
                    <NumberInput
                        label={`Balance${account.kind === "liability" ? " owed" : ""}`}
                        placeholder="0.00"
                        decimalScale={money.decimalPlaces}
                        fixedDecimalScale
                        min={0}
                        thousandSeparator=","
                        value={valueMajor}
                        onChange={setValueMajor}
                        style={{ flex: 1 }}
                    />
                    <Button
                        onClick={() => void handleAdd()}
                        loading={addBalance.isPending}
                    >
                        Add
                    </Button>
                </Group>

                {error && (
                    <Alert color="red" title="Error">
                        {error}
                    </Alert>
                )}

                {balancesQuery.isLoading ? (
                    <Center>
                        <Loader size="sm" />
                    </Center>
                ) : balances.length === 0 ? (
                    <Text c="dimmed" size="sm">
                        No balances yet. Add today's value to start the history.
                    </Text>
                ) : (
                    <Table verticalSpacing="xs">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Date</Table.Th>
                                <Table.Th style={{ textAlign: "right" }}>
                                    Balance
                                </Table.Th>
                                <Table.Th style={{ textAlign: "right" }}>
                                    Change
                                </Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {balances.map((b) => {
                                const change = deltaById.get(b.id);
                                // "Good" = wealth moving the right way: assets up, or debts down.
                                const good = change
                                    ? account.kind === "asset"
                                        ? change.delta > 0
                                        : change.delta < 0
                                    : false;
                                const flat = change
                                    ? change.delta === 0
                                    : false;
                                return (
                                    <Table.Tr key={b.id}>
                                        <Table.Td>{fmt(b.asOfDate)}</Table.Td>
                                        <Table.Td
                                            style={{
                                                textAlign: "right",
                                                fontVariantNumeric:
                                                    "tabular-nums",
                                            }}
                                        >
                                            {formatMoney(b.value, money)}
                                        </Table.Td>
                                        <Table.Td
                                            style={{
                                                textAlign: "right",
                                                fontVariantNumeric:
                                                    "tabular-nums",
                                            }}
                                        >
                                            {!change ? (
                                                <Text size="xs" c="dimmed">
                                                    —
                                                </Text>
                                            ) : (
                                                <Text
                                                    size="xs"
                                                    c={
                                                        flat
                                                            ? "dimmed"
                                                            : good
                                                              ? hearthTokens
                                                                    .semantic
                                                                    .positive
                                                              : "red"
                                                    }
                                                >
                                                    {change.delta > 0
                                                        ? "+"
                                                        : ""}
                                                    {formatMoney(
                                                        change.delta,
                                                        money
                                                    )}
                                                    {change.pct !== null
                                                        ? ` (${formatSignedPercent(change.pct)})`
                                                        : ""}
                                                </Text>
                                            )}
                                        </Table.Td>
                                        <Table.Td
                                            style={{ textAlign: "right" }}
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                size="sm"
                                                aria-label="Delete balance"
                                                onClick={() =>
                                                    void handleRemove(b.id)
                                                }
                                            >
                                                ×
                                            </ActionIcon>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                )}
            </Stack>
        </Modal>
    );
};
