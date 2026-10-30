import { Progress } from "@microcharts/react/progress";
import { formatMoney } from "@shared/money";
import { useElementWidth } from "@/useElementWidth";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import type { RecipientWithGifts } from "@/features/gifts/model";

export interface PersonCardProps {
    recipient: RecipientWithGifts;
    onEdit: () => void;
}

/** One person's share of the occasion: spent against their own budget. */
export const PersonCard = ({ recipient, onEdit }: PersonCardProps) => {
    const money = useMoney();
    const { ref, width } = useElementWidth<HTMLSpanElement>();

    const { totals, gifts } = recipient;
    const over = totals.left !== null && totals.left < 0;
    const count =
        gifts.length === 0
            ? "Nothing yet"
            : `${gifts.length} gift${gifts.length === 1 ? "" : "s"}`;

    return (
        <Button
            onClick={onEdit}
            aria-label={`Edit ${recipient.name}`}
            className="h-auto min-w-0 flex-col items-stretch gap-1.5 whitespace-normal rounded-xl p-3 text-left font-normal text-text"
        >
            <span className="truncate font-display text-md font-medium">
                {recipient.name}
            </span>
            <span ref={ref} className="block h-1 rounded-xs bg-sunken">
                {width > 0 && totals.budget !== null && (
                    <Progress
                        value={totals.spent}
                        max={Math.max(1, totals.budget)}
                        width={width}
                        height={4}
                        className="block"
                        color={
                            over
                                ? "var(--color-attention)"
                                : "var(--color-primary)"
                        }
                        title={`${recipient.name}'s budget`}
                        summary={`${formatMoney(totals.spent, money)} of ${formatMoney(totals.budget, money)} spent`}
                    />
                )}
            </span>
            <span className="flex items-baseline justify-between gap-2 text-xs">
                <span
                    className={`tabular ${over ? "text-attention-fg" : "text-text"}`}
                >
                    <span className="font-semibold">
                        {formatMoney(totals.spent, money)}
                    </span>
                    {totals.budget !== null && (
                        <span className="text-text-muted">
                            {" "}
                            / {formatMoney(totals.budget, money)}
                        </span>
                    )}
                    {over && ` · ${formatMoney(-totals.left!, money)} over`}
                </span>
                <span className="shrink-0 text-text-muted">{count}</span>
            </span>
        </Button>
    );
};
