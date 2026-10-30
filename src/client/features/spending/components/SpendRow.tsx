import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { ListRow } from "@/components/ui/ListRow";
import {
    needsPot,
    type Category,
    type Member,
    type Pot,
    type Spend,
} from "../model";
import { AssignPot } from "./AssignPot";

export interface SpendRowProps {
    spend: Spend;
    members: Member[];
    pots: Pot[];
    categories: Category[];
    money: MoneyFormat;
    onOpen: () => void;
}

const statusOf = (
    spend: Spend
): { label: string; variant: "tint" | "attention" | "secondary" } => {
    if (spend.reconciled === 1) return { label: "Reconciled", variant: "tint" };
    return spend.settledAtSource === 1
        ? { label: "Settled", variant: "secondary" }
        : { label: "Pending", variant: "attention" };
};

/** One transaction: what it was, where it came from, and where it's up to. */
export const SpendRow = ({
    spend,
    members,
    pots,
    categories,
    money,
    onOpen,
}: SpendRowProps) => {
    const unassigned = needsPot(spend);
    const refund = spend.amount < 0;
    const status = statusOf(spend);
    const source = unassigned
        ? "Needs a pot"
        : (pots.find((p) => p.id === spend.potId)?.name ??
          (categories.find((c) => c.id === spend.categoryId)?.name ||
              "Main account"));

    return (
        <ListRow
            title={spend.description}
            details={[
                source,
                members.find((m) => m.id === spend.ownerId)?.displayName,
                spend.splitGroupId && "Split",
            ]
                .filter(Boolean)
                .join(" · ")}
            value={
                <span className={refund ? "text-positive-fg" : undefined}>
                    {refund ? "+" : ""}
                    {formatMoney(Math.abs(spend.amount), money)}
                </span>
            }
            meta={
                !unassigned && (
                    <Badge variant={status.variant}>{status.label}</Badge>
                )
            }
            trailing={
                unassigned ? (
                    <AssignPot spend={spend} pots={pots} members={members} />
                ) : undefined
            }
            onClick={onOpen}
        />
    );
};
