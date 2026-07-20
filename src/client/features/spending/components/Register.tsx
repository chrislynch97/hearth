import type { Member, Pot } from "../../../../server/db/schema";
import type { MoneyFormat } from "@/useMoney";
import { useMemo, useState } from "react";
import { trpc } from "@/trpc";
import {
    Button,
    Card,
    Center,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    Title,
} from "@mantine/core";
import { SpendRow } from "@/features/spending/components/SpendRow";

export interface RegisterProps {
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    ownerFilter: string | null;
    setOwnerFilter: (ownerId: string | null) => void;
}

export const Register = ({
    members,
    pots,
    money,
    ownerFilter,
    setOwnerFilter,
}: RegisterProps) => {
    const [potFilter, setPotFilter] = useState<string | null>(null);
    const [reconciledFilter, setReconciledFilter] = useState<string | null>(
        null
    );
    const [needsPotOnly, setNeedsPotOnly] = useState(false);

    const input = useMemo(() => {
        const i: {
            ownerId?: string;
            potId?: string;
            reconciled?: boolean;
            needsPot?: boolean;
        } = {};
        if (ownerFilter) i.ownerId = ownerFilter;
        if (potFilter) i.potId = potFilter;
        if (reconciledFilter) i.reconciled = reconciledFilter === "yes";
        if (needsPotOnly) i.needsPot = true;
        return i;
    }, [ownerFilter, potFilter, reconciledFilter, needsPotOnly]);

    // Page through history rather than loading and rendering the whole table: fetch
    // `limit + 1` so we know whether a "Load more" is warranted, and reset to the
    // first page whenever the filters change.
    const PAGE_SIZE = 100;
    const [pages, setPages] = useState(1);
    const [pagedInput, setPagedInput] = useState(input);
    if (pagedInput !== input) {
        setPagedInput(input);
        setPages(1);
    }
    const limit = pages * PAGE_SIZE;

    const spendsQuery = trpc.spends.list.useQuery({
        ...input,
        limit: limit + 1,
    });
    const allRows = spendsQuery.data ?? [];
    const hasMore = allRows.length > limit;
    const spends = hasMore ? allRows.slice(0, limit) : allRows;
    // Queried once here and passed to every row, rather than each SpendRow mounting
    // its own categories.list subscription.
    const categories = trpc.categories.list.useQuery().data ?? [];

    return (
        <Card withBorder padding="md">
            <Stack gap="sm">
                <Title order={4}>Register</Title>
                <Group gap="sm" wrap="wrap" align="flex-end">
                    <Select
                        label="Owner"
                        placeholder="All"
                        data={members.map((m) => ({
                            value: m.id,
                            label: m.displayName,
                        }))}
                        value={ownerFilter}
                        onChange={setOwnerFilter}
                        clearable
                        size="xs"
                    />
                    <Select
                        label="Pot"
                        placeholder="All"
                        data={pots.map((p) => ({ value: p.id, label: p.name }))}
                        value={potFilter}
                        onChange={setPotFilter}
                        searchable
                        clearable
                        size="xs"
                    />
                    <Select
                        label="Reconciled"
                        placeholder="All"
                        data={[
                            { value: "yes", label: "Reconciled" },
                            { value: "no", label: "Pending" },
                        ]}
                        value={reconciledFilter}
                        onChange={setReconciledFilter}
                        clearable
                        size="xs"
                    />
                    <Switch
                        label="Needs a pot"
                        checked={needsPotOnly}
                        onChange={(e) =>
                            setNeedsPotOnly(e.currentTarget.checked)
                        }
                        mb={4}
                    />
                </Group>

                {spendsQuery.isLoading && (
                    <Center>
                        <Loader size="sm" />
                    </Center>
                )}

                {!spendsQuery.isLoading && spends.length === 0 && (
                    <Text c="dimmed" size="sm">
                        No spending transactions match these filters.
                    </Text>
                )}

                {!spendsQuery.isLoading && spends.length > 0 && (
                    <Table.ScrollContainer minWidth={700}>
                        <Table verticalSpacing="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th style={{ whiteSpace: "nowrap" }}>
                                        Date
                                    </Table.Th>
                                    <Table.Th>Description</Table.Th>
                                    <Table.Th>Owner</Table.Th>
                                    <Table.Th>Amount</Table.Th>
                                    <Table.Th>Pot</Table.Th>
                                    <Table.Th style={{ whiteSpace: "nowrap" }}>
                                        Status
                                    </Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {spends.map((s) => (
                                    <SpendRow
                                        key={s.id}
                                        spend={s}
                                        members={members}
                                        pots={pots}
                                        money={money}
                                        categories={categories}
                                    />
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}

                {!spendsQuery.isLoading && hasMore && (
                    <Group justify="center">
                        <Button
                            variant="default"
                            size="xs"
                            onClick={() => setPages((p) => p + 1)}
                        >
                            Load more
                        </Button>
                    </Group>
                )}
            </Stack>
        </Card>
    );
};
