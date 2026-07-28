import { useMemo, useState } from "react";
import {
    Alert,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import type { Account } from "../../server/db/schema";
import type { AccountWithValue } from "../../server/features/networth/accounts.router";
import { NetWorthHeadline } from "@/features/accounts/components/NetWorkHeadline";
import { TrendCard } from "@/features/accounts/components/TrendCard";
import { BalancesModal } from "@/features/accounts/components/BalancesModal";
import { daysSince, STALE_DAYS } from "@/features/accounts/util";
import type { OwnerOption } from "@/features/accounts/model";
import { AccountModal } from "@/features/accounts/components/AccountModal";
import { AccountGroup } from "@/features/accounts/components/AccountGroup";

export const AccountsPage = () => {
    const money = useMoney();
    const utils = trpc.useUtils();
    const membersQuery = trpc.members.list.useQuery();
    const accountsQuery = trpc.accounts.list.useQuery();
    const summaryQuery = trpc.accounts.summary.useQuery();
    const remove = trpc.accounts.remove.useMutation();

    const owners: OwnerOption[] = (membersQuery.data ?? [])
        .filter((m) => m.archivedAt === null)
        .map((m) => ({ value: m.id, label: m.displayName }));
    const ownerName = (id: string) =>
        owners.find((o) => o.value === id)?.label ?? "—";

    const accounts = useMemo(
        () => accountsQuery.data ?? [],
        [accountsQuery.data]
    );
    const assets = useMemo(
        () => accounts.filter((a) => a.kind === "asset"),
        [accounts]
    );
    const liabilities = useMemo(
        () => accounts.filter((a) => a.kind === "liability"),
        [accounts]
    );
    const staleCount = accounts.filter(
        (a) => a.asOfDate === null || daysSince(a.asOfDate) > STALE_DAYS
    ).length;

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Account | null>(null);
    const [modalKind, setModalKind] = useState<"asset" | "liability">("asset");
    const [balancesFor, setBalancesFor] = useState<AccountWithValue | null>(
        null
    );

    function openAdd(kind: "asset" | "liability") {
        setEditing(null);
        setModalKind(kind);
        setModalOpen(true);
    }
    function openEdit(a: AccountWithValue) {
        setEditing(a);
        setModalOpen(true);
    }
    async function handleDelete(a: AccountWithValue) {
        const msg =
            a.currentValue !== null
                ? `Delete "${a.name}" and its balance history? This can't be undone.`
                : `Delete "${a.name}"?`;
        if (!window.confirm(msg)) return;
        await remove.mutateAsync({ id: a.id });
        await Promise.all([
            utils.accounts.list.invalidate(),
            utils.accounts.summary.invalidate(),
        ]);
    }

    const summary = summaryQuery.data;
    const isLoading = accountsQuery.isLoading || summaryQuery.isLoading;

    return (
        <Stack gap="lg" maw={900} mx="auto">
            <Group justify="space-between" align="center">
                <Title order={2}>Accounts &amp; net worth</Title>
                <Button onClick={() => openAdd("asset")}>+ Add account</Button>
            </Group>

            {isLoading && (
                <Center>
                    <Loader size="sm" />
                </Center>
            )}

            {!isLoading && summary && (
                <>
                    <NetWorthHeadline
                        assets={summary.assets}
                        liabilities={summary.liabilities}
                        netWorth={summary.netWorth}
                        money={money}
                    />
                    <TrendCard timeline={summary.timeline} money={money} />
                </>
            )}

            {!isLoading && accounts.length > 0 && staleCount > 0 && (
                <Alert
                    color="apricot"
                    variant="light"
                    title="Some balances are out of date"
                >
                    {staleCount} account{staleCount === 1 ? "" : "s"}{" "}
                    {staleCount === 1 ? "hasn't" : "haven't"} been updated in
                    over {Math.round(STALE_DAYS / 30)} months — your net worth
                    may be stale. Open an account's balances to record a current
                    value.
                </Alert>
            )}

            {!isLoading && accounts.length === 0 && (
                <Text c="dimmed">
                    Track the things you own and owe — savings, pensions,
                    property, mortgage, loans — and Hearth charts your net worth
                    over time. Add your first account to begin.
                </Text>
            )}

            {!isLoading && accounts.length > 0 && (
                <>
                    <AccountGroup
                        title="Assets"
                        accounts={assets}
                        ownerName={ownerName}
                        total={summary?.assets ?? 0}
                        money={money}
                        onAdd={() => openAdd("asset")}
                        onEdit={openEdit}
                        onBalances={setBalancesFor}
                        onDelete={handleDelete}
                    />
                    <AccountGroup
                        title="Liabilities"
                        accounts={liabilities}
                        ownerName={ownerName}
                        total={summary?.liabilities ?? 0}
                        money={money}
                        onAdd={() => openAdd("liability")}
                        onEdit={openEdit}
                        onBalances={setBalancesFor}
                        onDelete={handleDelete}
                    />
                </>
            )}

            {modalOpen && (
                <AccountModal
                    opened={modalOpen}
                    onClose={() => setModalOpen(false)}
                    account={editing}
                    owners={owners}
                    defaultKind={modalKind}
                />
            )}

            {balancesFor && (
                <BalancesModal
                    opened={balancesFor !== null}
                    onClose={() => setBalancesFor(null)}
                    account={balancesFor}
                    money={money}
                />
            )}
        </Stack>
    );
};
