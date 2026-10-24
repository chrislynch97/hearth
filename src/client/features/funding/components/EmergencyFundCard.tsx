import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Figure } from "@/features/funding/components/Figure";
import { FigureRow } from "@/features/funding/components/FigureRow";
import { FundingCard } from "@/features/funding/components/FundingCard";
import type { FundingPlan } from "@/features/funding/model";

export interface EmergencyFundCardProps {
    emergencyFund: FundingPlan["emergencyFund"];
    money: MoneyFormat;
}

/** The savings cushion: a target per account, with the monthly commitments it
 *  is built from shown alongside so the multiple is visible. */
export const EmergencyFundCard = ({
    emergencyFund,
    money,
}: EmergencyFundCardProps) => {
    const { months, perOwner, total } = emergencyFund;

    return (
        <FundingCard
            title="Emergency fund"
            subtitle={`A cushion of ${months} month${months === 1 ? "" : "s"} of essential outgoings to hold in easy-access savings. Covers bills and set-asides; exclude any from its own settings. Set the months in Settings.`}
            figure={<Figure amount={formatMoney(total, money)} />}
        >
            {perOwner
                .filter((owner) => owner.target > 0)
                .map((owner) => (
                    <FigureRow
                        key={owner.memberId}
                        label={owner.displayName}
                        meta={`${formatMoney(owner.monthlyCommitments, money)}/mo × ${months}`}
                        amount={formatMoney(owner.target, money)}
                    />
                ))}
        </FundingCard>
    );
};
