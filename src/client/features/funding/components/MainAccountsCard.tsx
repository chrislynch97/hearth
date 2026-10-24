import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { FigureRow } from "@/features/funding/components/FigureRow";
import { FundingCard } from "@/features/funding/components/FundingCard";
import type { MainAccountGroup } from "@/features/funding/model";

export interface MainAccountsCardProps {
    groups: MainAccountGroup[];
    money: MoneyFormat;
    unit: string;
    /** e.g. "each month", for the subtitle. */
    adverb: string;
}

/** Bills with no pot, one block per account that pays them. Each block ends in
 *  what to leave in that account; there is deliberately no combined figure,
 *  because no single account has to hold it. */
export const MainAccountsCard = ({
    groups,
    money,
    unit,
    adverb,
}: MainAccountsCardProps) => {
    const amount = (minor: number) => `${formatMoney(minor, money)}${unit}`;

    return (
        <FundingCard
            title="Paid from the main account"
            subtitle={`Bills with no pot — leave this much in each account ${adverb} to cover them.`}
        >
            <div className="flex flex-col gap-4">
                {groups.map((group) => (
                    <div key={group.key}>
                        <h3 className="mb-1 text-eyebrow font-semibold uppercase text-text-faint">
                            {group.label}
                        </h3>
                        {group.rows.map((row) => (
                            <FigureRow
                                key={row.key}
                                label={row.name}
                                amount={amount(row.amount)}
                            />
                        ))}
                        <FigureRow
                            label={
                                group.key === "joint"
                                    ? "Leave in the joint account"
                                    : `Leave in ${group.label}'s account`
                            }
                            amount={amount(group.total)}
                            total
                        />
                    </div>
                ))}
            </div>
        </FundingCard>
    );
};
