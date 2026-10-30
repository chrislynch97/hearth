import { Check } from "lucide-react";
import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import type { Transfer } from "../model";

export interface TransferRowProps {
    transfer: Transfer;
    money: MoneyFormat;
    disabled: boolean;
    onOpen: () => void;
    /** Ticks it off in full, which is what nearly every transfer is. */
    onMoved: () => void;
}

/** One transfer on the list. The row opens the detail; the button is the
 *  everyday one tap. */
export const TransferRow = ({
    transfer,
    money,
    disabled,
    onOpen,
    onMoved,
}: TransferRowProps) => {
    const { payer, potName, required } = transfer;
    const pullBack = required < 0;
    const details = [
        pullBack && "Back into the pot",
        payer.count > 0 &&
            `${payer.count} ${payer.count === 1 ? "spend" : "spends"}`,
        payer.residual !== 0 &&
            `${formatMoney(Math.abs(payer.residual), money)} ${payer.residual > 0 ? "carried over" : "credit"}`,
    ];

    return (
        <ListRow
            title={potName}
            details={details.filter(Boolean).join(" · ")}
            value={`${pullBack ? "−" : ""}${formatMoney(Math.abs(required), money)}`}
            trailing={
                <Button
                    compact
                    icon={<Check />}
                    disabled={disabled}
                    aria-label={`Mark ${potName} as moved`}
                    className="max-sm:size-9 max-sm:px-0"
                    onClick={onMoved}
                >
                    <span className="hidden sm:inline">Moved</span>
                </Button>
            }
            onClick={onOpen}
        />
    );
};
