import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { StatRow } from "@/components/ui/StatRow";
import type {
    FundingPlan,
    MainAccountGroup,
    PotFunding,
} from "@/features/funding/model";
import { FundingAccountCard } from "./FundingAccountCard";
import { FundingSection } from "./FundingSection";

export interface PersonFundingCardProps {
    person: FundingPlan["perPerson"][number];
    pots: PotFunding[];
    /** The bills this person's own account pays directly, if any. */
    ownBills?: MainAccountGroup;
    pooled: boolean;
    money: MoneyFormat;
    adverb: string;
}

/** One person's money for the period: what leaves by standing order and where
 *  it goes, then what stays behind for their own bills. */
export const PersonFundingCard = ({
    person,
    pots,
    ownBills,
    pooled,
    money,
    adverb,
}: PersonFundingCardProps) => {
    const ownAccount = person.personalMainAccount;

    return (
        <FundingAccountCard
            title={person.displayName}
            figureLabel="By standing order"
            figure={formatMoney(person.setAside, money)}
            hint={adverb}
        >
            {person.personalPotFunding > 0 && (
                <FundingSection
                    title="To personal pots"
                    total={person.personalPotFunding}
                    rows={pots.map((pot) => ({
                        key: pot.potId,
                        name: pot.name,
                        amount: pot.fundingPerPeriod,
                    }))}
                    money={money}
                />
            )}
            <FundingSection
                title={pooled ? "Into joint" : "To the joint account"}
                total={person.jointContribution}
                money={money}
            />
            {ownAccount > 0 && (
                <>
                    <FundingSection
                        title="Stays in own account"
                        total={ownAccount}
                        rows={ownBills?.rows}
                        money={money}
                    />
                    <div className="py-2.5 last:pb-0">
                        <StatRow
                            label="Total spoken for"
                            value={formatMoney(
                                person.setAside + ownAccount,
                                money
                            )}
                            total
                        />
                    </div>
                </>
            )}
        </FundingAccountCard>
    );
};
