import { useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PersonPicker } from "@/components/ui/PersonPicker";
import { Spinner } from "@/components/ui/Spinner";
import { ComponentsDialog } from "@/features/income/components/ComponentsDialog";
import { NetPayCard } from "@/features/income/components/NetPayCard";
import { PayslipDialog } from "@/features/income/components/PayslipDialog";
import { PayslipRow } from "@/features/income/components/PayslipRow";
import type { Payslip } from "@/features/income/model";

/** Each person's payslips: what's landed lately and every one on record. */
export const PayslipsPage = () => {
    const money = useMoney();
    const utils = trpc.useUtils();
    const membersQuery = trpc.members.list.useQuery();
    const remove = trpc.payslips.remove.useMutation();
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [managing, setManaging] = useState(false);
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<Payslip | null>(null);
    const [deleting, setDeleting] = useState<Payslip | null>(null);

    const persons = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null && m.kind === "person"
    );
    const activeOwner = ownerId ?? persons[0]?.id ?? null;
    const scope = { ownerId: activeOwner ?? "" };
    const enabled = { enabled: activeOwner !== null };
    const componentsQuery = trpc.payslipComponents.list.useQuery(
        scope,
        enabled
    );
    const payslipsQuery = trpc.payslips.list.useQuery(scope, enabled);
    const components = componentsQuery.data ?? [];
    // Newest first from the server.
    const payslips = payslipsQuery.data ?? [];
    const isLoading = componentsQuery.isLoading || payslipsQuery.isLoading;

    const confirmDelete = async () => {
        if (!deleting) return;
        await remove.mutateAsync({ id: deleting.id });
        await Promise.all([
            utils.payslips.list.invalidate(),
            utils.income.overview.invalidate(),
        ]);
        setDeleting(null);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Payslips"
                actions={
                    activeOwner && (
                        <>
                            <Button
                                icon={<SlidersHorizontal />}
                                className="max-sm:flex-1"
                                onClick={() => setManaging(true)}
                            >
                                Components
                            </Button>
                            {components.length > 0 && (
                                <Button
                                    icon={<Plus />}
                                    className="max-sm:flex-1"
                                    onClick={() => setAdding(true)}
                                >
                                    Add payslip
                                </Button>
                            )}
                        </>
                    )
                }
            />
            {!membersQuery.isLoading && persons.length === 0 && (
                <p className="text-base text-text-muted">
                    Add people to your household to record payslips.
                </p>
            )}
            {activeOwner && (
                <PersonPicker
                    label="Whose payslips"
                    persons={persons}
                    value={activeOwner}
                    onChange={setOwnerId}
                />
            )}
            {isLoading && <Spinner label="Loading payslips" />}
            {activeOwner && !isLoading && payslips.length === 0 && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        {components.length === 0
                            ? "Start with Components: the earnings and deductions on this person's payslip. Then you can add a payslip."
                            : "No payslips yet. Use Add payslip to record one."}
                    </CardContent>
                </Card>
            )}
            {payslips.length > 0 && (
                <>
                    <NetPayCard payslips={payslips} money={money} />
                    <Card>
                        <CardHeader>
                            <CardTitle>History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="-mx-2 flex flex-col divide-y divide-border">
                                {payslips.map((payslip) => (
                                    <PayslipRow
                                        key={payslip.id}
                                        payslip={payslip}
                                        money={money}
                                        onOpen={() => setEditing(payslip)}
                                    />
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </>
            )}

            {activeOwner && managing && (
                <ComponentsDialog
                    ownerId={activeOwner}
                    components={components}
                    onClose={() => setManaging(false)}
                />
            )}
            {activeOwner && (adding || editing) && (
                <PayslipDialog
                    ownerId={activeOwner}
                    components={components}
                    lastPayslip={payslips[0] ?? null}
                    payslip={editing}
                    money={money}
                    onClose={() => {
                        setAdding(false);
                        setEditing(null);
                    }}
                    onDelete={(payslip) => {
                        setEditing(null);
                        setDeleting(payslip);
                    }}
                />
            )}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`Delete ${deleting?.periodLabel ?? "this payslip"}?`}
                description="It comes out of your income history. This can't be undone."
                tone="danger"
                confirm={{
                    label: "Delete payslip",
                    onClick: () => void confirmDelete(),
                    pending: remove.isPending,
                }}
            />
        </div>
    );
};
