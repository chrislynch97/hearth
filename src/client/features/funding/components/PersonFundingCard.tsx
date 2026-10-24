import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { FigureRow } from "@/features/funding/components/FigureRow";
import { FundingCard } from "@/features/funding/components/FundingCard";
import type { FundingPlan } from "@/features/funding/model";

export interface PersonFundingCardProps {
    person: FundingPlan["perPerson"][number];
    pooled: boolean;
    money: MoneyFormat;
    unit: string;
}

/** One person's money for the period as a running sum: what moves by standing
 *  order, then what stays behind for their own bills, then the two together. No
 *  headline figure — leading with one total made the rows below it misread. */
export const PersonFundingCard = ({
    person,
    pooled,
    money,
    unit,
}: PersonFundingCardProps) => {
    const amount = (minor: number) => `${formatMoney(minor, money)}${unit}`;
    const ownAccount = person.personalMainAccount;

    return (
        <FundingCard title={person.displayName}>
            <FigureRow
                label="To personal pots"
                amount={amount(person.personalPotFunding)}
            />
            <FigureRow
                label={pooled ? "Into joint" : "To the joint account"}
                amount={amount(person.jointContribution)}
            />
            <FigureRow
                label="By standing order"
                amount={amount(person.setAside)}
                total
            />
            {ownAccount > 0 && (
                <>
                    <FigureRow
                        label="Stays in own account"
                        amount={amount(ownAccount)}
                    />
                    <FigureRow
                        label="Total spoken for"
                        amount={amount(person.setAside + ownAccount)}
                        total
                    />
                </>
            )}
        </FundingCard>
    );
};
