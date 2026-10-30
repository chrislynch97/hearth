import { useState } from "react";
import { Plus } from "lucide-react";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { AccountDialog } from "@/features/accounts/components/AccountDialog";
import { AccountGroup } from "@/features/accounts/components/AccountGroup";
import { BalancesDialog } from "@/features/accounts/components/BalancesDialog";
import { NetWorthCard } from "@/features/accounts/components/NetWorthCard";
import type { AccountWithValue, OwnerOption } from "@/features/accounts/model";
import { daysSince, STALE_DAYS } from "@/features/accounts/util";

/** What the household owns and owes, and how that has moved over time. */
export const AccountsPage = () => {
    const money = useMoney();
    const utils = trpc.useUtils();
    const membersQuery = trpc.members.list.useQuery();
    const accountsQuery = trpc.accounts.list.useQuery();
    const summaryQuery = trpc.accounts.summary.useQuery();
    const remove = trpc.accounts.remove.useMutation();
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<AccountWithValue | null>(null);
    const [balancesFor, setBalancesFor] = useState<AccountWithValue | null>(
        null
    );
    const [deleting, setDeleting] = useState<AccountWithValue | null>(null);

    const owners: OwnerOption[] = (membersQuery.data ?? [])
        .filter((m) => m.archivedAt === null)
        .map((m) => ({ value: m.id, label: m.displayName }));
    const accounts = accountsQuery.data ?? [];
    const summary = summaryQuery.data;
    const isLoading = accountsQuery.isLoading || summaryQuery.isLoading;
    const staleCount = accounts.filter(
        (a) => a.asOfDate === null || daysSince(a.asOfDate) > STALE_DAYS
    ).length;

    const ownerName = (id: string) =>
        owners.find((o) => o.value === id)?.label ?? "—";

    const confirmDelete = async () => {
        if (!deleting) return;
        await remove.mutateAsync({ id: deleting.id });
        await Promise.all([
            utils.accounts.list.invalidate(),
            utils.accounts.summary.invalidate(),
        ]);
        setDeleting(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Net worth"
                actions={
                    <Button
                        icon={<Plus />}
                        className="max-sm:w-full"
                        onClick={() => setAdding(true)}
                    >
                        Add account
                    </Button>
                }
            />
            {isLoading && <Spinner label="Loading accounts" />}
            {!isLoading && accounts.length === 0 && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        Track the things you own and owe — savings, pensions,
                        property, mortgage, loans — and Hearth charts your net
                        worth over time. Add your first account to begin.
                    </CardContent>
                </Card>
            )}
            {!isLoading && summary && accounts.length > 0 && (
                <>
                    <NetWorthCard summary={summary} money={money} />
                    {staleCount > 0 && (
                        <Notice
                            tone="attention"
                            title="Some balances are out of date"
                        >
                            {staleCount} account{staleCount === 1 ? "" : "s"}{" "}
                            {staleCount === 1 ? "hasn't" : "haven't"} been
                            updated in over {Math.round(STALE_DAYS / 30)}{" "}
                            months, so your net worth may be behind. Open an
                            account to record a current value.
                        </Notice>
                    )}
                    <div className="grid items-start gap-5 lg:grid-cols-2">
                        <AccountGroup
                            title="Assets"
                            accounts={accounts.filter(
                                (a) => a.kind === "asset"
                            )}
                            ownerName={ownerName}
                            total={summary.assets}
                            money={money}
                            onOpen={setBalancesFor}
                        />
                        <AccountGroup
                            title="Liabilities"
                            accounts={accounts.filter(
                                (a) => a.kind === "liability"
                            )}
                            ownerName={ownerName}
                            total={summary.liabilities}
                            money={money}
                            onOpen={setBalancesFor}
                        />
                    </div>
                </>
            )}

            {(adding || editing) && (
                <AccountDialog
                    account={editing}
                    owners={owners}
                    onClose={() => {
                        setAdding(false);
                        setEditing(null);
                    }}
                    onDelete={(account) => {
                        setEditing(null);
                        setDeleting(account);
                    }}
                />
            )}
            {balancesFor && (
                <BalancesDialog
                    account={balancesFor}
                    money={money}
                    onClose={() => setBalancesFor(null)}
                    onEdit={() => {
                        setEditing(balancesFor);
                        setBalancesFor(null);
                    }}
                />
            )}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`Delete ${deleting?.name ?? ""}?`}
                description="This removes the account and its balance history, and takes it out of your net worth. It can't be undone."
                tone="danger"
                confirm={{
                    label: "Delete account",
                    onClick: () => void confirmDelete(),
                    pending: remove.isPending,
                }}
            />
        </div>
    );
};
