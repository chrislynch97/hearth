import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
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
        <div
            className={[
                "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3.5 py-2.5",
                short
                    ? "border border-attention bg-attention-tint"
                    : "bg-primary-tint-weak",
            ].join(" ")}
        >
            <p className="min-w-0 flex-[1_1_280px] text-base">
                <strong className="font-semibold">{lead}</strong>
                {rest}
            </p>
            {short && needed !== null && canApply && (
                <Button
                    variant="solid"
                    disabled={pending}
                    onClick={() => onUse(needed)}
                >
                    Use {formatMoney(needed, money)}
                    {periodUnitLabel(detail.period.frequency)}
                </Button>
            )}
            {short && !canApply && (
                <Link to="/plan" className="text-sm font-semibold text-primary">
                    Change the {detail.potName} pot's lines on Plan →
                </Link>
            )}
        </div>
    );
};
