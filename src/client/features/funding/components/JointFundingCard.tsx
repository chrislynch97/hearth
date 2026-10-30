import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import type {
    FundingPlan,
    MainAccountGroup,
    PotFunding,
} from "@/features/funding/model";
import { FundingAccountCard } from "./FundingAccountCard";
import { FundingSection } from "./FundingSection";

export interface JointFundingCardProps {
    plan: FundingPlan;
    pots: PotFunding[];
    /** The bills the joint account pays directly, if any. */
    bills?: MainAccountGroup;
    money: MoneyFormat;
    adverb: string;
}

/** The joint account: everything going into its pots, what stays behind for its
 *  own bills and, under pooled funding, how the pool comes out. */
export const JointFundingCard = ({
    plan,
    pots,
    bills,
    money,
    adverb,
}: JointFundingCardProps) => {
    const { totalIn, jointCosts, surplus } = plan.jointPool;
    const pooled = plan.jointFundingModel === "pooled";

    return (
        <FundingAccountCard
            title="Joint"
            figureLabel="Into joint pots"
            figure={formatMoney(plan.jointPotFundingTotal, money)}
            hint={adverb}
        >
            {pots.length > 0 && (
                <FundingSection
                    rows={pots.map((pot) => ({
                        key: pot.potId,
                        name: pot.name,
                        amount: pot.fundingPerPeriod,
                    }))}
                    money={money}
                />
            )}
            {bills && (
                <FundingSection
                    title="Stays in the joint account"
                    total={bills.total}
                    rows={bills.rows}
                    money={money}
                />
            )}
            {pooled && (
                <>
                    <FundingSection
                        title="Everyone puts in"
                        total={totalIn}
                        money={money}
                    />
                    <FundingSection
                        title="Joint costs"
                        total={jointCosts}
                        money={money}
                    />
                    <FundingSection
                        title="Surplus"
                        total={surplus}
                        money={money}
                        negative={surplus < 0}
                    />
                </>
            )}
        </FundingAccountCard>
    );
};
