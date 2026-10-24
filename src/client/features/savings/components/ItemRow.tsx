import { formatMoney } from "@shared/money";
import type { ItemFlag } from "@shared/savings";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { PaidPrompt } from "@/features/savings/components/PaidPrompt";
import { FLAG_LABEL } from "@/features/savings/model";
import type { SavingsItem } from "../../../../server/db/schema";

export interface ItemRowProps {
    item: SavingsItem;
    /** The goal date, for an item with no deadline of its own. */
    targetDate: string;
    flag: ItemFlag | undefined;
    money: MoneyFormat;
    /** Set while the "take it off the target?" step is open for this row. */
    prompt: { target: number; pending: boolean } | null;
    onTick: () => void;
    onUntick: () => void;
    onReduce: () => void;
    onKeep: () => void;
    onCancel: () => void;
    onEdit: () => void;
}

/** One line item. Ticked by hand when it's paid; nothing ticks itself. */
export const ItemRow = ({
    item,
    targetDate,
    flag,
    money,
    prompt,
    onTick,
    onUntick,
    onReduce,
    onKeep,
    onCancel,
    onEdit,
}: ItemRowProps) => {
    const formatDate = useFormatDate();

    const paid = item.paidOn !== null;
    const checked = paid || prompt !== null;
    const when = item.paidOn
        ? `Paid ${formatDate(item.paidOn)}`
        : item.dueDate
          ? `Due ${formatDate(item.dueDate)}`
          : `Due on the day, ${formatDate(targetDate)}`;

    return (
        <li className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-t border-border px-3.5 py-2.5 first:border-t-0">
            <input
                type="checkbox"
                checked={checked}
                disabled={prompt?.pending}
                aria-label={`${item.name} paid`}
                onChange={() => (paid ? onUntick() : onTick())}
                className="accent-primary h-4 w-4 cursor-pointer"
            />
            <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${item.name}`}
                className="min-w-0 text-left"
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
                    <span className="ml-1.5 inline-block rounded-xs bg-attention-tint px-1.5 align-[1px] text-xs font-semibold text-attention-fg">
                        {FLAG_LABEL[flag.kind]}
                    </span>
                )}
                <span className="block text-xs text-text-muted">
                    {when}
                    {flag &&
                        ` · ${formatMoney(flag.shortBy, money)} short by then`}
                </span>
            </button>
            <span className="tabular text-right font-semibold">
                {formatMoney(item.amount, money)}
            </span>
            {prompt && (
                <PaidPrompt
                    amount={item.amount}
                    target={prompt.target}
                    money={money}
                    pending={prompt.pending}
                    onReduce={onReduce}
                    onKeep={onKeep}
                    onCancel={onCancel}
                />
            )}
        </li>
    );
};
