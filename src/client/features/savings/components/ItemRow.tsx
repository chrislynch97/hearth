import { formatMoney } from "@shared/money";
import type { ItemFlag } from "@shared/savings";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Button } from "@/components/ui/Button";
import { FLAG_LABEL } from "@/features/savings/model";
import type { SavingsItem } from "../../../../server/db/schema";

export interface ItemRowProps {
    item: SavingsItem;
    /** The goal date, for an item with no deadline of its own. */
    targetDate: string;
    flag: ItemFlag | undefined;
    money: MoneyFormat;
    /** While an untick is saving. */
    pending: boolean;
    /** Opens the "mark paid" step; the box ticks once that's saved. */
    onTick: () => void;
    onUntick: () => void;
    onEdit: () => void;
}

/** One line item. Ticked by hand when it's paid; nothing ticks itself, and the
 *  box shows only what's saved. */
export const ItemRow = ({
    item,
    targetDate,
    flag,
    money,
    pending,
    onTick,
    onUntick,
    onEdit,
}: ItemRowProps) => {
    const formatDate = useFormatDate();

    const paid = item.paidOn !== null;
    const when = item.paidOn
        ? `Paid ${formatDate(item.paidOn)}`
        : item.dueDate
          ? `Due ${formatDate(item.dueDate)}`
          : `Due on the day, ${formatDate(targetDate)}`;

    return (
        <li className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-t border-border px-3.5 py-2.5 first:border-t-0">
            <Checkbox
                checked={paid}
                disabled={pending}
                aria-label={`${item.name} paid`}
                onCheckedChange={() => (paid ? onUntick() : onTick())}
            />
            <Button
                variant="ghost"
                onClick={onEdit}
                aria-label={`Edit ${item.name}`}
                className="block h-auto min-w-0 whitespace-normal px-1 py-0.5 text-left font-normal"
            >
                <span
                    className={[
                        "font-medium [overflow-wrap:anywhere]",
                        paid
                            ? "text-text-secondary line-through decoration-text-faint"
                            : "text-text",
                    ].join(" ")}
                >
                    {item.name}
                </span>
                {flag && (
                    <Badge variant="attention" className="ml-1.5">
                        {FLAG_LABEL[flag.kind]}
                    </Badge>
                )}
                <span className="block text-xs text-text-muted">
                    {when}
                    {flag &&
                        ` · ${formatMoney(flag.shortBy, money)} short by then`}
                </span>
            </Button>
            <span className="tabular text-right font-semibold">
                {formatMoney(item.amount, money)}
            </span>
        </li>
    );
};
