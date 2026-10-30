import { useState } from "react";
import { Plus } from "lucide-react";
import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { formatSignedPercent, useFormatDate, useMoney } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListRow } from "@/components/ui/ListRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { RaiseDialog } from "@/features/raises/components/RaiseDialog";
import { SalaryCard } from "@/features/raises/components/SalaryCard";
import type { Raise } from "@/features/raises/model";

/** Each person's salary history: where it stands and every step on the way. */
export const RaisesPage = () => {
    const money = useMoney();
    const formatDate = useFormatDate();
    const utils = trpc.useUtils();
    const membersQuery = trpc.members.list.useQuery();
    const remove = trpc.raises.remove.useMutation();
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<Raise | null>(null);
    const [deleting, setDeleting] = useState<Raise | null>(null);

    const persons = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null && m.kind === "person"
    );
    const activeOwner = ownerId ?? persons[0]?.id ?? null;
    const raisesQuery = trpc.raises.list.useQuery(
        { ownerId: activeOwner ?? "" },
        { enabled: activeOwner !== null }
    );
    const oldestFirst = raisesQuery.data ?? [];

    const confirmDelete = async () => {
        if (!deleting) return;
        await remove.mutateAsync({ id: deleting.id });
        await Promise.all([
            utils.raises.list.invalidate(),
            utils.income.overview.invalidate(),
        ]);
        setDeleting(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Raises"
                actions={
                    activeOwner && (
                        <Button
                            icon={<Plus />}
                            className="max-sm:w-full"
                            onClick={() => setAdding(true)}
                        >
                            Add raise
                        </Button>
                    )
                }
            />
            {!membersQuery.isLoading && persons.length === 0 && (
                <p className="text-base text-text-muted">
                    Add people to your household to record raises.
                </p>
            )}
            {persons.length > 1 && activeOwner && (
                <SegmentedControl
                    label="Whose raises"
                    options={persons.map((p) => ({
                        value: p.id,
                        label: p.displayName,
                    }))}
                    value={activeOwner}
                    onChange={setOwnerId}
                    className="w-full sm:w-fit [&>*]:flex-1"
                />
            )}
            {raisesQuery.isLoading && <Spinner label="Loading raises" />}
            {activeOwner &&
                !raisesQuery.isLoading &&
                oldestFirst.length === 0 && (
                    <Card>
                        <CardContent className="text-base text-text-muted">
                            No raises recorded yet. Add the starting salary as
                            the first entry.
                        </CardContent>
                    </Card>
                )}
            {oldestFirst.length > 0 && (
                <>
                    <SalaryCard raises={oldestFirst} money={money} />
                    <Card>
                        <CardHeader>
                            <CardTitle>History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="-mx-2 flex flex-col divide-y divide-border">
                                {[...oldestFirst].reverse().map((raise) => (
                                    <ListRow
                                        key={raise.id}
                                        title={formatDate(raise.effectiveDate)}
                                        details={[
                                            raise.newPosition,
                                            raise.bonus != null &&
                                                `${formatMoney(raise.bonus, money)} bonus`,
                                            raise.note,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        value={formatMoney(
                                            raise.newSalary,
                                            money
                                        )}
                                        meta={
                                            raise.percentIncrease !== null && (
                                                <span
                                                    className={`tabular text-sm ${raise.percentIncrease >= 0 ? "text-positive-fg" : "text-danger"}`}
                                                >
                                                    {formatSignedPercent(
                                                        raise.percentIncrease
                                                    )}
                                                </span>
                                            )
                                        }
                                        onClick={() => setEditing(raise)}
                                    />
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </>
            )}

            {activeOwner && (adding || editing) && (
                <RaiseDialog
                    ownerId={activeOwner}
                    raise={editing}
                    onClose={() => {
                        setAdding(false);
                        setEditing(null);
                    }}
                    onDelete={(raise) => {
                        setEditing(null);
                        setDeleting(raise);
                    }}
                />
            )}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title="Delete this raise?"
                description="It comes out of the salary history, and the raise after it will compare against the one before. This can't be undone."
                tone="danger"
                confirm={{
                    label: "Delete raise",
                    onClick: () => void confirmDelete(),
                    pending: remove.isPending,
                }}
            />
        </div>
    );
};
