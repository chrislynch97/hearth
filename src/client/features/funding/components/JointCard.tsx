import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Figure } from "@/features/funding/components/Figure";
import { FigureRow } from "@/features/funding/components/FigureRow";
import { FundingCard } from "@/features/funding/components/FundingCard";
import type { FundingPlan } from "@/features/funding/model";

export interface JointCardProps {
    plan: FundingPlan;
    money: MoneyFormat;
    unit: string;
}

/** Joint costs and how they are covered. Under pooled funding the pool is the
 *  point — in, out, and what is left; under split, just the joint pots' total. */
export const JointCard = ({ plan, money, unit }: JointCardProps) => {
    const amount = (minor: number) => `${formatMoney(minor, money)}${unit}`;

    if (plan.jointFundingModel !== "pooled") {
        return (
            <FundingCard
                title="Joint pots total"
                subtitle="Covered by everyone's joint contribution"
                figure={
                    <Figure
                        amount={formatMoney(plan.jointPotFundingTotal, money)}
                        unit={unit}
                    />
                }
            />
        );
    }

    const { totalIn, jointCosts, surplus } = plan.jointPool;

    return (
        <FundingCard
            title="Joint pool"
            subtitle="Everyone's contribution flows into joint, which covers the joint costs. The leftover is the surplus."
            figure={
                <Figure
                    amount={formatMoney(surplus, money)}
                    unit={unit}
                    negative={surplus < 0}
                />
            }
        >
            <FigureRow label="Total in" amount={amount(totalIn)} />
            <FigureRow label="Joint costs" amount={amount(jointCosts)} />
            <FigureRow
                label="Surplus"
                amount={amount(surplus)}
                negative={surplus < 0}
                total
            />
        </FundingCard>
    );
};
