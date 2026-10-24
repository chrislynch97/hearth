import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { FigureRow } from "@/features/funding/components/FigureRow";
import { FundingCard } from "@/features/funding/components/FundingCard";
import type { PotFunding } from "@/features/funding/model";
import type { Member } from "../../../../server/db/schema";

export interface StandingOrdersCardProps {
    potsByOwner: Map<string, PotFunding[]>;
    members: Member[];
    money: MoneyFormat;
    unit: string;
}

/** Every pot that needs money moving into it, under the account it comes from —
 *  the list to check against the standing orders at the bank. */
export const StandingOrdersCard = ({
    potsByOwner,
    members,
    money,
    unit,
}: StandingOrdersCardProps) => {
    const memberById = new Map(members.map((member) => [member.id, member]));

    return (
        <FundingCard title="Standing orders">
            {potsByOwner.size === 0 ? (
                <p className="text-sm text-text-muted">
                    No standing orders needed yet.
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    {[...potsByOwner.entries()].map(([ownerId, pots]) => (
                        <div key={ownerId}>
                            <h3 className="mb-1 text-eyebrow font-semibold uppercase text-text-faint">
                                {memberById.get(ownerId)?.displayName ??
                                    "Former member"}
                            </h3>
                            {pots.map((pot) => (
                                <FigureRow
                                    key={pot.potId}
                                    label={pot.name}
                                    amount={`${formatMoney(pot.fundingPerPeriod, money)}${unit}`}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </FundingCard>
    );
};
