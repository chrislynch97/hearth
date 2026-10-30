import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { StatRow } from "@/components/ui/StatRow";
import type { FundingPlan } from "@/features/funding/model";
import { FundingAccountCard } from "./FundingAccountCard";

export interface EmergencyFundCardProps {
    emergencyFund: FundingPlan["emergencyFund"];
    money: MoneyFormat;
}

/** The savings cushion: a target per account, with the monthly commitments it's
 *  built from shown so the multiple is visible. */
export const EmergencyFundCard = ({
    emergencyFund,
    money,
}: EmergencyFundCardProps) => {
    const { months, perOwner, total } = emergencyFund;

    return (
        <FundingAccountCard
            title="Emergency fund"
            figureLabel="To hold in easy-access savings"
            figure={formatMoney(total, money)}
            hint={`${months} ${months === 1 ? "month" : "months"} of essential bills and set-asides. Change the months in Settings, and leave any out from their own settings.`}
        >
            <div className="flex flex-col gap-1">
                {perOwner
                    .filter((owner) => owner.target > 0)
                    .map((owner) => (
                        <StatRow
                            key={owner.memberId}
                            label={`${owner.displayName} · ${formatMoney(owner.monthlyCommitments, money)} × ${months}`}
                            value={formatMoney(owner.target, money)}
                        />
                    ))}
            </div>
        </FundingAccountCard>
    );
};
