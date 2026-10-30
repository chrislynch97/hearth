import { formatMoney } from "@shared/money";
import { annualise, type Recurrence } from "@shared/recurrence";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export interface BillUpdate {
    expenseId: string;
    name: string;
    from: number;
    to: number;
    recurrence: Recurrence;
    effectiveDate: string;
    // Carried so the confirmation can name the pot whose standing order this
    // change makes stale (issue #69).
    funding: "pot_manual" | "pot_auto" | "main";
    potId: string | null;
}

export interface BillUpdatePromptProps {
    update: BillUpdate;
    money: MoneyFormat;
    pending: boolean;
    onUpdate: () => void;
    onKeep: () => void;
}

/** Asks whether a bill logged at a new price should stay at it from now on. */
export const BillUpdatePrompt = ({
    update,
    money,
    pending,
    onUpdate,
    onKeep,
}: BillUpdatePromptProps) => {
    const { name, from, to, recurrence } = update;
    const yearly = annualise(to - from, recurrence);

    return (
        <Notice tone="attention" title={`Update ${name}?`}>
            <span className="flex flex-col gap-2">
                <span>
                    That was {formatMoney(to, money)}, not the expected{" "}
                    {formatMoney(from, money)}. Keep it at the new price from
                    now on?
                    {yearly !== 0 &&
                        ` That's ${yearly > 0 ? "+" : "−"}${formatMoney(Math.abs(yearly), money)} a year.`}
                </span>
                <span className="flex flex-wrap gap-2">
                    <Button
                        compact
                        variant="solid"
                        disabled={pending}
                        onClick={onUpdate}
                    >
                        Update {name}
                    </Button>
                    <Button compact disabled={pending} onClick={onKeep}>
                        Keep as is
                    </Button>
                </span>
            </span>
        </Notice>
    );
};
