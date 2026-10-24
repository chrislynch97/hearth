import { useState } from "react";
import { formatMoney } from "@shared/money";
import { periodAdverb, periodConfig, periodUnitLabel } from "@shared/period";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmergencyFundCard } from "@/features/funding/components/EmergencyFundCard";
import { JointCard } from "@/features/funding/components/JointCard";
import { MainAccountsCard } from "@/features/funding/components/MainAccountsCard";
import { PersonFundingCard } from "@/features/funding/components/PersonFundingCard";
import { StandingOrderAlerts } from "@/features/funding/components/StandingOrderAlerts";
import { StandingOrdersCard } from "@/features/funding/components/StandingOrdersCard";
import {
    buildPlanText,
    mainAccountGroups,
    potsByOwner,
} from "@/features/funding/model";
import { PaydayPdfButton } from "@/pages/PaydayPdfButton";

export const FundingPage = () => {
    const fundingQuery = trpc.plan.funding.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const categoriesQuery = trpc.categories.list.useQuery();
    const ctx = trpc.bootstrap.context.useQuery();
    const [copied, setCopied] = useState(false);

    const money = useMoney();
    const frequency = periodConfig(ctx.data?.household ?? 1).frequency;
    const unit = periodUnitLabel(frequency);

    const isLoading = fundingQuery.isLoading || membersQuery.isLoading;
    const plan = fundingQuery.data;
    const members = membersQuery.data ?? [];
    const hasAnything = plan
        ? plan.perPerson.length > 0 || plan.pots.length > 0
        : false;

    const copyPlan = async () => {
        if (!plan) return;
        try {
            await navigator.clipboard.writeText(
                buildPlanText(plan, money, unit)
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard blocked (e.g. insecure context); the plan is still on screen.
        }
    };

    return (
        <div className="mx-auto flex max-w-[900px] flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-strong pb-5">
                <div className="min-w-0">
                    <h1 className="font-display text-h1 font-medium leading-tight">
                        Funding Plan
                    </h1>
                    {plan && hasAnything && (
                        <p className="mt-1 text-sm text-text-muted">
                            What to set up as standing orders in Monzo (or your
                            bank) {periodAdverb(frequency)}.
                        </p>
                    )}
                </div>
                {plan && hasAnything && (
                    <div className="flex items-center gap-2">
                        <PaydayPdfButton />
                        <Button variant="ghost" onClick={() => void copyPlan()}>
                            {copied ? "Copied ✓" : "Copy plan"}
                        </Button>
                    </div>
                )}
            </header>

            {isLoading && <Spinner label="Loading the funding plan" />}

            {!isLoading && (!plan || !hasAnything) && (
                <p className="text-sm text-text-muted">
                    Add outgoings to see your funding plan.
                </p>
            )}

            {!isLoading && plan && hasAnything && (
                <>
                    <StandingOrderAlerts />

                    {plan.unassignedFundingPerPeriod > 0 && (
                        <p
                            role="status"
                            className="rounded-md bg-attention-tint px-4 py-3 text-sm text-attention-fg"
                        >
                            {formatMoney(
                                plan.unassignedFundingPerPeriod,
                                money
                            )}{" "}
                            of outgoings isn't assigned to a pot.
                        </p>
                    )}

                    {/* Stacked on a phone: side by side, each person's figures get
                        a column too narrow for the amounts. */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {plan.perPerson.map((person) => (
                            <PersonFundingCard
                                key={person.memberId}
                                person={person}
                                pooled={plan.jointFundingModel === "pooled"}
                                money={money}
                                unit={unit}
                            />
                        ))}
                    </div>

                    <JointCard plan={plan} money={money} unit={unit} />

                    {plan.mainAccountFundingPerPeriod > 0 && (
                        <MainAccountsCard
                            groups={mainAccountGroups(
                                plan,
                                members,
                                categoriesQuery.data ?? []
                            )}
                            money={money}
                            unit={unit}
                            adverb={periodAdverb(frequency)}
                        />
                    )}

                    {plan.emergencyFund.total > 0 && (
                        <EmergencyFundCard
                            emergencyFund={plan.emergencyFund}
                            money={money}
                        />
                    )}

                    <StandingOrdersCard
                        potsByOwner={potsByOwner(plan)}
                        members={members}
                        money={money}
                        unit={unit}
                    />
                </>
            )}
        </div>
    );
};
