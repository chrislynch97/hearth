import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatMoney, toMinor } from "@shared/money";
import { trpc } from "@/trpc";
import {
    formatSignedPercent,
    useFormatDate,
    type MoneyFormat,
} from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { subtypeLabel, today } from "../util";
import type { AccountWithValue } from "../model";

export interface BalancesDialogProps {
    account: AccountWithValue;
    money: MoneyFormat;
    onClose: () => void;
    onEdit: () => void;
}

/** Record what an account stands at, and see how it got there. Stays open after
 *  adding, so a run of old balances can go in one after another. */
export const BalancesDialog = ({
    account,
    money,
    onClose,
    onEdit,
}: BalancesDialogProps) => {
    const utils = trpc.useUtils();
    const formatDate = useFormatDate();
    const balances = trpc.accounts.balances.useQuery({
        accountId: account.id,
    });
    const addBalance = trpc.accounts.addBalance.useMutation();
    const removeBalance = trpc.accounts.removeBalance.useMutation();
    const [valueMajor, setValueMajor] = useState("");
    const [asOfDate, setAsOfDate] = useState(today());
    const [error, setError] = useState("");

    const liability = account.kind === "liability";
    const oldestFirst = balances.data ?? [];
    const rows = oldestFirst
        .map((balance, i) => ({
            balance,
            previous: oldestFirst[i - 1]?.value ?? null,
        }))
        .reverse();

    const refresh = () =>
        Promise.all([
            utils.accounts.balances.invalidate({ accountId: account.id }),
            utils.accounts.list.invalidate(),
            utils.accounts.summary.invalidate(),
        ]);

    const add = async () => {
        if (!asOfDate) return setError("Choose a date.");
        if (valueMajor === "" || Number.isNaN(Number(valueMajor)))
            return setError("Enter the balance.");
        setError("");
        try {
            await addBalance.mutateAsync({
                accountId: account.id,
                asOfDate,
                value: toMinor(Number(valueMajor), money.decimalPlaces),
            });
            setValueMajor("");
            await refresh();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not add the balance."
            );
        }
    };

    const remove = async (id: string) => {
        await removeBalance.mutateAsync({ id });
        await refresh();
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={account.name}
            description={[
                subtypeLabel(account.kind, account.subtype),
                account.institution,
            ]
                .filter(Boolean)
                .join(" · ")}
            confirm={{
                label: "Add balance",
                onClick: () => void add(),
                pending: addBalance.isPending,
            }}
            aside={<Button onClick={onEdit}>Edit account</Button>}
        >
            <div className="grid grid-cols-2 gap-4">
                <TextField
                    label={liability ? "Balance owed" : "Balance"}
                    inputMode="decimal"
                    prefix={money.symbol}
                    placeholder="0.00"
                    value={valueMajor}
                    onChange={(e) => setValueMajor(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && void add()}
                />
                <TextField
                    label="As of"
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && void add()}
                />
            </div>
            {error && <Notice tone="danger" title={error} />}
            {balances.isLoading ? (
                <Spinner label="Loading balances" />
            ) : rows.length === 0 ? (
                <p className="text-base text-text-muted">
                    No balances yet. Add today&apos;s value to start the
                    history.
                </p>
            ) : (
                <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium text-text-secondary">
                        History
                    </h3>
                    <ul className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto">
                        {rows.map(({ balance, previous }) => {
                            const delta =
                                previous === null
                                    ? null
                                    : balance.value - previous;
                            // Wealth moving the right way: assets up, debts down.
                            const good =
                                delta !== null &&
                                (liability ? delta < 0 : delta > 0);
                            return (
                                <li
                                    key={balance.id}
                                    className="flex items-center gap-3 py-1.5"
                                >
                                    <span className="flex-1 text-base text-text-secondary">
                                        {formatDate(balance.asOfDate)}
                                    </span>
                                    <span className="flex flex-col items-end">
                                        <span className="tabular text-base text-text">
                                            {formatMoney(balance.value, money)}
                                        </span>
                                        {delta !== null && delta !== 0 && (
                                            <span
                                                className={`tabular text-sm ${good ? "text-positive-fg" : "text-danger"}`}
                                            >
                                                {delta > 0 ? "+" : ""}
                                                {formatMoney(delta, money)}
                                                {previous
                                                    ? ` (${formatSignedPercent((delta / previous) * 100)})`
                                                    : ""}
                                            </span>
                                        )}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        className="size-8 px-0 text-text-muted hover:text-danger"
                                        aria-label={`Delete balance from ${formatDate(balance.asOfDate)}`}
                                        icon={<Trash2 />}
                                        disabled={removeBalance.isPending}
                                        onClick={() => void remove(balance.id)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </ConfirmDialog>
    );
};
