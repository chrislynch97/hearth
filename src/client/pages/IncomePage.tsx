import { useState } from "react";
import { Plus } from "lucide-react";
import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { IncomeSourceDialog } from "@/features/income/components/IncomeSourceDialog";
import { IncomeSourceRow } from "@/features/income/components/IncomeSourceRow";
import { MemberIncomeCard } from "@/features/income/components/MemberIncomeCard";
import type { IncomeSource } from "@/features/income/model";

/** The monthly figure all the budgeting works from, and what goes into it. */
export const IncomePage = () => {
    const money = useMoney();
    const overviewQuery = trpc.income.overview.useQuery();
    const sourcesQuery = trpc.incomeSources.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<IncomeSource | null>(null);

    const overview = overviewQuery.data;
    const sources = sourcesQuery.data ?? [];
    const members = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null
    );
    const isLoading = overviewQuery.isLoading || membersQuery.isLoading;

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Income"
                actions={
                    <Button
                        icon={<Plus />}
                        className="max-sm:w-full"
                        onClick={() => setAdding(true)}
                    >
                        Add income
                    </Button>
                }
            />
            {isLoading && <Spinner label="Loading income" />}
            {!isLoading && overview && (
                <>
                    <Card>
                        <CardContent className="flex flex-col gap-1.5">
                            <span className="text-sm font-medium text-text-muted">
                                Household monthly income
                            </span>
                            <span className="tabular font-display text-fig-xl font-medium leading-none text-text">
                                {formatMoney(
                                    overview.householdMonthlyIncome,
                                    money
                                )}
                            </span>
                        </CardContent>
                    </Card>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {overview.perMember
                            .filter(
                                (m) =>
                                    m.kind === "person" || m.monthlyIncome > 0
                            )
                            .map((member) => (
                                <MemberIncomeCard
                                    key={member.memberId}
                                    member={member}
                                    money={money}
                                />
                            ))}
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Other income</CardTitle>
                            <CardDescription>
                                Salaries come from payslips. Anything else, like
                                rent, benefits or side income, goes here.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {sources.length === 0 ? (
                                <p className="text-base text-text-muted">
                                    Nothing here yet.
                                </p>
                            ) : (
                                <ul className="-mx-2 flex flex-col divide-y divide-border">
                                    {sources.map((source) => (
                                        <IncomeSourceRow
                                            key={source.id}
                                            source={source}
                                            ownerName={
                                                members.find(
                                                    (m) =>
                                                        m.id === source.ownerId
                                                )?.displayName
                                            }
                                            money={money}
                                            onOpen={() => setEditing(source)}
                                        />
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {(adding || editing) && (
                <IncomeSourceDialog
                    source={editing}
                    members={members}
                    onClose={() => {
                        setAdding(false);
                        setEditing(null);
                    }}
                />
            )}
        </div>
    );
};
