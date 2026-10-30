import { lazy, Suspense } from "react";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { GettingStarted } from "@/components/GettingStarted";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { AllocationCard } from "@/features/home/components/AllocationCard";
import { BacklogHeadline } from "@/features/home/components/BacklogHeadline";
import { NetWorthTile } from "@/features/home/components/NetWorthTile";
import { PeriodSnapshot } from "@/features/home/components/PeriodSnapshot";
import { SavingsAlerts } from "@/features/home/components/SavingsAlerts";
import { greetingFor } from "@/features/home/model";

// Lazy so recharts (the app's heaviest dependency) isn't in the home chunk;
// the chart card pops in once its chunk arrives.
const IncomeTrendChart = lazy(() =>
    import("@/features/home/components/IncomeTrendChart").then((m) => ({
        default: m.IncomeTrendChart,
    }))
);

export const HomePage = () => {
    const money = useMoney();
    const ctx = trpc.bootstrap.context.useQuery();
    const summaryQuery = trpc.dashboard.summary.useQuery();
    const accountsSummary = trpc.accounts.summary.useQuery();
    const me = trpc.users.me.useQuery();

    // Greet the person: their linked budgeting member, else their account name,
    // falling back to the household name (e.g. an open instance with no account).
    const greetingName =
        me.data?.linkedMemberName ||
        me.data?.displayName ||
        ctx.data?.household?.displayName;
    const summary = summaryQuery.data;
    const now = new Date();

    if (ctx.isLoading || summaryQuery.isLoading) {
        return <Spinner label="Loading the overview" />;
    }

    return (
        <div className="hearth-ds mx-auto flex max-w-[1100px] flex-col gap-5">
            <PageHeader
                title={`${greetingFor(now.getHours())}${greetingName ? `, ${greetingName}` : ""}`}
                description={now.toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                })}
            />

            <GettingStarted />

            {summary && (
                <>
                    <BacklogHeadline backlog={summary.backlog} money={money} />
                    <SavingsAlerts
                        alerts={summary.savingsAlerts}
                        money={money}
                    />
                    <div className="grid gap-5 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <PeriodSnapshot
                                funding={summary.funding}
                                coupleSurplus={summary.coupleSurplus}
                                money={money}
                            />
                        </div>
                        {accountsSummary.data && (
                            <NetWorthTile
                                data={accountsSummary.data}
                                money={money}
                            />
                        )}
                    </div>
                    <Suspense fallback={null}>
                        <IncomeTrendChart
                            trend={summary.incomeTrend}
                            earners={summary.incomeEarners}
                            money={money}
                        />
                    </Suspense>
                    <AllocationCard
                        allocation={summary.allocation}
                        householdIncome={summary.householdPeriodIncome}
                        money={money}
                    />
                </>
            )}
        </div>
    );
};
