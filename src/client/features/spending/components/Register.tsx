import { useState } from "react";
import { todayIso } from "@shared/dates";
import { formatMoney } from "@shared/money";
import { groupedPotOptions } from "@/potOptions";
import { trpc } from "@/trpc";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import {
    dayHeading,
    groupByDay,
    statusInput,
    type Member,
    type Pot,
    type Spend,
    type StatusFilter,
} from "../model";
import { EditSpendDialog } from "./EditSpendDialog";
import { SplitSpendDialog } from "./SplitSpendDialog";
import { SpendRow } from "./SpendRow";

const PAGE_SIZE = 100;

const STATUSES: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Any status" },
    { value: "needs-pot", label: "Needs a pot" },
    { value: "pending", label: "Pending" },
    { value: "reconciled", label: "Reconciled" },
];

export interface RegisterProps {
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    ownerFilter: string | null;
    initialStatus: StatusFilter;
}

/** Every transaction, newest first and a day at a time, the way a bank shows
 *  them. Pages through history rather than loading the whole table. */
export const Register = ({
    members,
    pots,
    money,
    ownerFilter,
    initialStatus,
}: RegisterProps) => {
    const utils = trpc.useUtils();
    const categories = trpc.categories.list.useQuery().data ?? [];
    const remove = trpc.spends.remove.useMutation();
    const [potFilter, setPotFilter] = useState<string | null>(null);
    const [status, setStatus] = useState(initialStatus);
    const [pages, setPages] = useState(1);
    const [editing, setEditing] = useState<Spend | null>(null);
    const [splitting, setSplitting] = useState<Spend | null>(null);
    const [deleting, setDeleting] = useState<Spend | null>(null);

    const limit = pages * PAGE_SIZE;
    // One over the page, to know whether there's more to load.
    const spendsQuery = trpc.spends.list.useQuery({
        ...(ownerFilter ? { ownerId: ownerFilter } : {}),
        ...(potFilter ? { potId: potFilter } : {}),
        ...statusInput(status),
        limit: limit + 1,
    });
    const rows = spendsQuery.data ?? [];

    const filterBy = (apply: () => void) => {
        apply();
        setPages(1);
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        await remove.mutateAsync({ id: deleting.id });
        await Promise.all([
            utils.spends.list.invalidate(),
            utils.spends.lastByOwner.invalidate(),
            utils.reconcile.backlog.invalidate(),
        ]);
        setDeleting(null);
    };

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Transactions</CardTitle>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                    <Combobox
                        label="Pot"
                        hideLabel
                        placeholder="All pots"
                        clearLabel="All pots"
                        options={groupedPotOptions(pots, members)}
                        value={potFilter}
                        onChange={(next) => filterBy(() => setPotFilter(next))}
                        className="min-w-0 sm:w-40"
                    />
                    <ChoiceField
                        label="Status"
                        hideLabel
                        options={STATUSES}
                        value={status}
                        onChange={(next) => filterBy(() => setStatus(next))}
                        className="min-w-0 sm:w-40"
                    />
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {spendsQuery.isLoading && (
                    <Spinner label="Loading transactions" />
                )}
                {!spendsQuery.isLoading && rows.length === 0 && (
                    <p className="text-base text-text-muted">
                        Nothing matches these filters.
                    </p>
                )}
                {groupByDay(rows.slice(0, limit)).map((day) => (
                    <section
                        key={day.date}
                        className="-mx-2 flex flex-col gap-0.5"
                    >
                        <div className="flex items-baseline justify-between gap-3 rounded-md bg-sunken px-2 py-1.5">
                            <h3 className="text-sm font-semibold text-text-secondary">
                                {dayHeading(day.date, todayIso(), money.locale)}
                            </h3>
                            <span className="tabular text-sm text-text-muted">
                                {day.total < 0 ? "+" : ""}
                                {formatMoney(Math.abs(day.total), money)}
                            </span>
                        </div>
                        <ul className="flex flex-col">
                            {day.spends.map((spend) => (
                                <SpendRow
                                    key={spend.id}
                                    spend={spend}
                                    members={members}
                                    pots={pots}
                                    categories={categories}
                                    money={money}
                                    onOpen={() => setEditing(spend)}
                                />
                            ))}
                        </ul>
                    </section>
                ))}
                {rows.length > limit && (
                    <Button
                        className="self-center"
                        onClick={() => setPages((p) => p + 1)}
                    >
                        Load more
                    </Button>
                )}
            </CardContent>

            {editing && (
                <EditSpendDialog
                    spend={editing}
                    members={members}
                    pots={pots}
                    money={money}
                    onClose={() => setEditing(null)}
                    onSplit={() => {
                        setSplitting(editing);
                        setEditing(null);
                    }}
                    onDelete={() => {
                        setDeleting(editing);
                        setEditing(null);
                    }}
                />
            )}
            {splitting && (
                <SplitSpendDialog
                    spend={splitting}
                    members={members}
                    pots={pots}
                    money={money}
                    onClose={() => setSplitting(null)}
                />
            )}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`Delete ${deleting?.description ?? "this spend"}?`}
                description="This can't be undone."
                tone="danger"
                confirm={{
                    label: "Delete",
                    onClick: () => void confirmDelete(),
                    pending: remove.isPending,
                }}
            />
        </Card>
    );
};
