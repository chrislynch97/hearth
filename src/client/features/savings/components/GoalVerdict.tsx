import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { verdict, type GoalDetail } from "@/features/savings/model";

export interface GoalVerdictProps {
    detail: GoalDetail;
    money: MoneyFormat;
    pending: boolean;
    onUse: (perPeriod: number) => void;
}

/** Over or short, in a sentence. Being over only says how low you could go;
 *  only short offers to change the set-aside. */
export const GoalVerdict = ({
    detail,
    money,
    pending,
    onUse,
}: GoalVerdictProps) => {
    const formatDate = useFormatDate();

    const { tone, lead, rest, needed } = verdict(detail, money, formatDate);
    const short = tone === "short";
    // "Use this" rewrites the pot's one line; several lines are the household's to split.
    const canApply = detail.contributionLineCount <= 1;

    return (
        <Notice
            tone={short ? "attention" : "positive"}
            title={
                <span className="font-normal">
                    <strong className="font-semibold">{lead}</strong>
                    {rest}
                </span>
            }
            action={
                short &&
                needed !== null &&
                (canApply ? (
                    <Button
                        variant="attention"
                        disabled={pending}
                        onClick={() => onUse(needed)}
                    >
                        Use {formatMoney(needed, money)}
                        {periodUnitLabel(detail.period.frequency)}
                    </Button>
                ) : (
                    <Button asChild>
                        <Link to="/plan">Change it on Plan</Link>
                    </Button>
                ))
            }
        />
    );
};
