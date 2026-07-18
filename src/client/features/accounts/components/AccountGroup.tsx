import { type MoneyFormat, useFormatDate } from "@/useMoney";
import type { AccountWithValue } from "../../../../server/routers/accounts";
import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Group,
    Table,
    Text,
    Title,
} from "@mantine/core";
import { formatMoney } from "@shared/money";
import {
    ageLabel,
    daysSince,
    STALE_DAYS,
    SUBTYPES,
} from "@/features/accounts/util";

const subtypeLabel = (kind: string, value: string | null): string | null => {
    if (!value) return null;
    return (
        SUBTYPES[kind as "asset" | "liability"]?.find((s) => s.value === value)
            ?.label ?? value
    );
};

export interface AccountGroupProps {
    title: string;
    accounts: AccountWithValue[];
    ownerName: (id: string) => string;
    total: number;
    money: MoneyFormat;
    onAdd: () => void;
    onEdit: (a: AccountWithValue) => void;
    onBalances: (a: AccountWithValue) => void;
    onDelete: (a: AccountWithValue) => void;
}

export const AccountGroup = ({
    title,
    accounts,
    ownerName,
    total,
    money,
    onAdd,
    onEdit,
    onBalances,
    onDelete,
}: AccountGroupProps) => {
    const fmt = useFormatDate();

    return (
        <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
                <Title order={4}>{title}</Title>
                <Group gap="md">
                    <Text
                        fw={700}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                        {formatMoney(total, money)}
                    </Text>
                    <Button size="xs" variant="light" onClick={onAdd}>
                        + Add
                    </Button>
                </Group>
            </Group>
            {accounts.length === 0 ? (
                <Text c="dimmed" size="sm">
                    None yet.
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={520}>
                    <Table verticalSpacing="xs" horizontalSpacing="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th style={{ whiteSpace: "nowrap" }}>
                                    Account
                                </Table.Th>
                                <Table.Th>Owner</Table.Th>
                                <Table.Th style={{ whiteSpace: "nowrap" }}>
                                    As of
                                </Table.Th>
                                <Table.Th style={{ textAlign: "right" }}>
                                    Value
                                </Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {accounts.map((a) => (
                                <Table.Tr key={a.id}>
                                    <Table.Td>
                                        <Group gap={6} wrap="nowrap">
                                            <Text
                                                size="sm"
                                                style={{ whiteSpace: "nowrap" }}
                                            >
                                                {a.name}
                                            </Text>
                                            {subtypeLabel(
                                                a.kind,
                                                a.subtype
                                            ) && (
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="gray"
                                                >
                                                    {subtypeLabel(
                                                        a.kind,
                                                        a.subtype
                                                    )}
                                                </Badge>
                                            )}
                                            {a.institution && (
                                                <Text size="xs" c="dimmed">
                                                    {a.institution}
                                                </Text>
                                            )}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {ownerName(a.ownerId)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        {a.asOfDate === null ? (
                                            <Badge
                                                size="xs"
                                                variant="light"
                                                color="apricot"
                                            >
                                                no data
                                            </Badge>
                                        ) : (
                                            <Group gap={6} wrap="nowrap">
                                                <Text size="xs" c="dimmed">
                                                    {fmt(a.asOfDate)}
                                                </Text>
                                                {daysSince(a.asOfDate) >
                                                    STALE_DAYS && (
                                                    <Badge
                                                        size="xs"
                                                        variant="light"
                                                        color="apricot"
                                                        title={ageLabel(
                                                            daysSince(
                                                                a.asOfDate
                                                            )
                                                        )}
                                                    >
                                                        stale
                                                    </Badge>
                                                )}
                                            </Group>
                                        )}
                                    </Table.Td>
                                    <Table.Td
                                        style={{
                                            textAlign: "right",
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {a.currentValue === null ? (
                                            <Text size="sm" c="dimmed">
                                                no data
                                            </Text>
                                        ) : (
                                            formatMoney(a.currentValue, money)
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Group
                                            gap={4}
                                            justify="flex-end"
                                            wrap="nowrap"
                                        >
                                            <Button
                                                size="compact-xs"
                                                variant="subtle"
                                                onClick={() => onBalances(a)}
                                            >
                                                Balances
                                            </Button>
                                            <ActionIcon
                                                variant="subtle"
                                                size="sm"
                                                aria-label="Edit account"
                                                onClick={() => onEdit(a)}
                                            >
                                                ✎
                                            </ActionIcon>
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                size="sm"
                                                aria-label="Delete account"
                                                onClick={() => onDelete(a)}
                                            >
                                                ×
                                            </ActionIcon>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </Card>
    );
};
