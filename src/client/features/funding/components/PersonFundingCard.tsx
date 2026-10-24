import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Figure } from "@/features/funding/components/Figure";
import { FigureRow } from "@/features/funding/components/FigureRow";
import { FundingCard } from "@/features/funding/components/FundingCard";
import type { FundingPlan } from "@/features/funding/model";

export interface PersonFundingCardProps {
    person: FundingPlan["perPerson"][number];
    pooled: boolean;
    money: MoneyFormat;
    unit: string;
}

/** One person's standing orders. The headline is what leaves their account by
 *  standing order; own-account bills sit apart below it because nothing moves
 *  for them — mixing them into the breakdown is what made the card misread. */
export const PersonFundingCard = ({
    person,
    pooled,
    money,
    unit,
}: PersonFundingCardProps) => {
    const amount = (minor: number) => `${formatMoney(minor, money)}${unit}`;

    return (
        <FundingCard
            title={person.displayName}
            subtitle="Set aside by standing order"
            figure={
                <Figure
                    amount={formatMoney(person.setAside, money)}
                    unit={unit}
                    size="lg"
                />
            }
        >
            <FigureRow
                label="Personal pots"
                amount={amount(person.personalPotFunding)}
            />
            <FigureRow
                label={pooled ? "Into joint" : "Joint contribution"}
                amount={amount(person.jointContribution)}
            />
            {person.personalMainAccount > 0 && (
                <div className="mt-3 rounded-sm bg-sunken px-3 py-2">
                    <FigureRow
                        label="Paid from own account"
                        amount={amount(person.personalMainAccount)}
                    />
                    <p className="text-xs text-text-muted">
                        Bills that already leave {person.displayName}'s account
                        — not part of the set-aside, nothing to move.
                    </p>
                </div>
            )}
        </FundingCard>
    );
};
