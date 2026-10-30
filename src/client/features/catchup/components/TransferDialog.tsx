import { useState } from "react";
import { formatMoney, fromMinor } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { isOvershoot, parseMoved, settlement, type Transfer } from "../model";
import { useSettle } from "../useSettle";

export interface TransferDialogProps {
    transfer: Transfer;
    recipient: string;
    money: MoneyFormat;
    onClose: () => void;
}

/** A transfer in full: what it's made of, and room for moving less than asked.
 *  Whatever isn't moved carries over to the next catch-up. */
export const TransferDialog = ({
    transfer,
    recipient,
    money,
    onClose,
}: TransferDialogProps) => {
    const formatDate = useFormatDate();
    const { move, writeOff, refresh, pending, error } = useSettle();
    const { potId, potName, payer, required } = transfer;
    const dp = money.decimalPlaces;
    const [amount, setAmount] = useState(
        fromMinor(Math.abs(required), dp).toFixed(dp)
    );
    const [invalid, setInvalid] = useState(false);

    const { isPullBack, hasSpends } = settlement(payer);
    const moved = parseMoved(amount, dp);
    const short = Math.abs(required) - moved;

    const submit = async () => {
        if (moved <= 0) return setInvalid(true);
        setInvalid(false);
        await move(potId, payer, moved);
        await refresh();
        onClose();
    };

    const clear = async () => {
        await writeOff(potId, payer);
        onClose();
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={
                isPullBack
                    ? `${recipient} → ${potName}`
                    : `${potName} → ${recipient}`
            }
            description={
                hasSpends
                    ? undefined
                    : "Carried over from an earlier part-move, with no spends left behind it."
            }
            confirm={{
                label: "Mark as moved",
                onClick: () => void submit(),
                pending,
            }}
            aside={
                !hasSpends && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() => void clear()}
                    >
                        Write it off
                    </Button>
                )
            }
        >
            <TextField
                label="Amount moved"
                inputMode="decimal"
                prefix={money.symbol}
                placeholder="0.00"
                value={amount}
                error={invalid ? "Enter the amount you moved." : undefined}
                onChange={(e) => setAmount(e.currentTarget.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                }}
            />
            {isOvershoot(moved, required) ? (
                <p className="text-sm text-text-muted">
                    That&apos;s {formatMoney(-short, money)} more than needed.
                    The extra becomes a credit next time.
                </p>
            ) : (
                moved > 0 &&
                short > 0 && (
                    <p className="text-sm text-text-muted">
                        The other {formatMoney(short, money)} carries over to
                        the next catch-up.
                    </p>
                )
            )}
            {hasSpends && payer.residual !== 0 && (
                <p className="text-sm text-text-muted">
                    Includes {formatMoney(Math.abs(payer.residual), money)}{" "}
                    {payer.residual > 0 ? "carried over" : "of credit"}.
                </p>
            )}
            {payer.spends.length > 0 && (
                <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium text-text-secondary">
                        {payer.spends.length}{" "}
                        {payer.spends.length === 1 ? "spend" : "spends"}
                    </h3>
                    <ul className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto">
                        {payer.spends.map((spend) => (
                            <li
                                key={spend.id}
                                className="flex items-center justify-between gap-3 py-1.5"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-base text-text">
                                        {spend.description}
                                    </span>
                                    <span className="block text-sm text-text-muted">
                                        {formatDate(spend.date)}
                                    </span>
                                </span>
                                <span className="tabular shrink-0 text-base text-text">
                                    {spend.amount < 0 ? "+" : ""}
                                    {formatMoney(Math.abs(spend.amount), money)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {error && <Notice tone="danger" title={error.message} />}
        </ConfirmDialog>
    );
};
