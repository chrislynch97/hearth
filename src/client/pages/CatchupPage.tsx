import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { HistoryCard } from "@/features/catchup/components/HistoryCard";
import { TransferDialog } from "@/features/catchup/components/TransferDialog";
import { TransferSectionCard } from "@/features/catchup/components/TransferSectionCard";
import {
    backlogToMove,
    transferSections,
    type Transfer,
} from "@/features/catchup/model";

/** The bank transfers still to make: one list to work down, per person, ticking
 *  each off as it's done. */
export const CatchupPage = () => {
    const money = useMoney();
    const membersQuery = trpc.members.list.useQuery();
    const backlogQuery = trpc.reconcile.backlog.useQuery();
    const [open, setOpen] = useState<{
        transfer: Transfer;
        recipient: string;
    } | null>(null);

    const members = membersQuery.data ?? [];
    const backlog = backlogQuery.data;
    const isLoading = membersQuery.isLoading || backlogQuery.isLoading;
    const sections = transferSections(backlog?.perPot ?? [], members);
    const { transfers: count, total: toMove } = backlogToMove(
        backlog?.perPot ?? []
    );

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader title="Catch-up" />
            {isLoading && <Spinner label="Loading catch-up" />}
            {!isLoading && backlog && (
                <>
                    {count > 0 ? (
                        <Card>
                            <CardContent className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-text-muted">
                                    To move
                                </span>
                                <span className="tabular font-display text-fig-xl font-medium leading-none text-text">
                                    {formatMoney(Math.abs(toMove), money)}
                                </span>
                                <span className="text-base text-text-muted">
                                    {count}{" "}
                                    {count === 1 ? "transfer" : "transfers"}
                                </span>
                            </CardContent>
                        </Card>
                    ) : (
                        <Notice tone="positive" title="All caught up">
                            No transfers to make right now.
                        </Notice>
                    )}
                    {backlog.unassigned.count > 0 && (
                        <Notice
                            tone="attention"
                            title={`${backlog.unassigned.count} ${backlog.unassigned.count === 1 ? "spend needs" : "spends need"} a pot`}
                            action={
                                <Button asChild>
                                    <Link
                                        to="/spending"
                                        search={{ status: "needs-pot" }}
                                    >
                                        Assign pots
                                    </Link>
                                </Button>
                            }
                        >
                            {formatMoney(
                                Math.abs(backlog.unassigned.total),
                                money
                            )}{" "}
                            can&apos;t be moved until it has one.
                        </Notice>
                    )}
                    {sections.map((section) => (
                        <TransferSectionCard
                            key={section.ownerId}
                            section={section}
                            money={money}
                            onOpen={(transfer) =>
                                setOpen({ transfer, recipient: section.name })
                            }
                        />
                    ))}
                    <HistoryCard members={members} money={money} />
                </>
            )}

            {open && (
                <TransferDialog
                    transfer={open.transfer}
                    recipient={open.recipient}
                    money={money}
                    onClose={() => setOpen(null)}
                />
            )}
        </div>
    );
};
