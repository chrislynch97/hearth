import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatMoney } from "@shared/money";
import { periodAdverb, periodConfig, periodUnitLabel } from "@shared/period";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { EmergencyFundCard } from "@/features/funding/components/EmergencyFundCard";
import { JointFundingCard } from "@/features/funding/components/JointFundingCard";
import { PersonFundingCard } from "@/features/funding/components/PersonFundingCard";
import { StandingOrderAlerts } from "@/features/funding/components/StandingOrderAlerts";
import {
    buildPlanText,
    mainAccountGroups,
    potsByOwner,
} from "@/features/funding/model";
import { PaydayPdfButton } from "@/pages/PaydayPdfButton";

/** What each account has to do when pay lands: one card per account, so
 *  everything to set up for it is in one place. */
export const FundingPage = () => {
    const money = useMoney();
    const fundingQuery = trpc.plan.funding.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const categoriesQuery = trpc.categories.list.useQuery();
    const ctx = trpc.bootstrap.context.useQuery();
    const [copied, setCopied] = useState(false);

    const frequency = periodConfig(ctx.data?.household ?? 1).frequency;
    const adverb = periodAdverb(frequency);
    const isLoading = fundingQuery.isLoading || membersQuery.isLoading;
    const plan = fundingQuery.data;
    const members = membersQuery.data ?? [];
    const hasAnything = plan
        ? plan.perPerson.length > 0 || plan.pots.length > 0
        : false;
    const pots = plan ? potsByOwner(plan) : new Map();
    const bills = plan
        ? mainAccountGroups(plan, members, categoriesQuery.data ?? [])
        : [];
    const personIds = new Set(plan?.perPerson.map((p) => p.memberId));
    // Anyone who isn't a listed person: the joint member, and an archived owner.
    const jointPots = [...pots.entries()]
        .filter(([ownerId]) => !personIds.has(ownerId))
        .flatMap(([, owned]) => owned);

    const copyPlan = async () => {
        if (!plan) return;
        try {
            await navigator.clipboard.writeText(
                buildPlanText(plan, money, periodUnitLabel(frequency))
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard blocked (e.g. insecure context); the plan is still on screen.
        }
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Funding plan"
                description={
                    hasAnything
                        ? `What to set up at the bank ${adverb}.`
                        : undefined
                }
                actions={
                    plan &&
                    hasAnything && (
                        <>
                            <PaydayPdfButton />
                            <Button
                                icon={copied ? <Check /> : <Copy />}
                                className="max-sm:flex-1"
                                onClick={() => void copyPlan()}
                            >
                                {copied ? "Copied" : "Copy plan"}
                            </Button>
                        </>
                    )
                }
            />
            {isLoading && <Spinner label="Loading the funding plan" />}
            {!isLoading && (!plan || !hasAnything) && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        Add outgoings to see your funding plan.
                    </CardContent>
                </Card>
            )}
            {!isLoading && plan && hasAnything && (
                <>
                    <StandingOrderAlerts />
                    {plan.unassignedFundingPerPeriod > 0 && (
                        <Notice
                            tone="attention"
                            title={`${formatMoney(plan.unassignedFundingPerPeriod, money)} of outgoings isn't assigned to a pot`}
                        />
                    )}
                    <div className="grid gap-5 sm:grid-cols-2">
                        {plan.perPerson.map((person) => (
                            <PersonFundingCard
                                key={person.memberId}
                                person={person}
                                pots={pots.get(person.memberId) ?? []}
                                ownBills={bills.find(
                                    (b) => b.key === person.memberId
                                )}
                                pooled={plan.jointFundingModel === "pooled"}
                                money={money}
                                adverb={adverb}
                            />
                        ))}
                    </div>
                    <JointFundingCard
                        plan={plan}
                        pots={jointPots}
                        bills={bills.find((b) => b.key === "joint")}
                        money={money}
                        adverb={adverb}
                    />
                    {plan.emergencyFund.total > 0 && (
                        <EmergencyFundCard
                            emergencyFund={plan.emergencyFund}
                            money={money}
                        />
                    )}
                </>
            )}
        </div>
    );
};
