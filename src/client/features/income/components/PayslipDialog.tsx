import { useState } from "react";
import { formatMonthYear } from "@shared/dateFormat";
import { todayIso } from "@shared/dates";
import { formatMoney, fromMinor, toMinor } from "@shared/money";
import { trpc } from "@/trpc";
import type { MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { StatRow } from "@/components/ui/StatRow";
import { TextField } from "@/components/ui/TextField";
import type { Payslip, PayslipComponent } from "../model";

export interface PayslipDialogProps {
    ownerId: string;
    components: PayslipComponent[];
    /** Adding carries its stable lines forward from here. */
    lastPayslip: Payslip | null;
    /** Null adds a new payslip. */
    payslip: Payslip | null;
    money: MoneyFormat;
    onClose: () => void;
    onDelete: (payslip: Payslip) => void;
}

const SECTIONS: Array<{ kind: string; title: string }> = [
    { kind: "earning", title: "Earnings" },
    { kind: "deduction", title: "Deductions" },
    { kind: "employer_info", title: "Employer info (not counted)" },
];

/** A payslip's lines, with the net worked out as they're typed. Mounted per
 *  open, so the fields always start from the payslip as it is now. */
export const PayslipDialog = ({
    ownerId,
    components,
    lastPayslip,
    payslip,
    money,
    onClose,
    onDelete,
}: PayslipDialogProps) => {
    const utils = trpc.useUtils();
    const create = trpc.payslips.create.useMutation();
    const update = trpc.payslips.update.useMutation();
    const dp = money.decimalPlaces;
    // Editing shows this payslip's lines; adding carries the stable ones from
    // the last payslip and leaves the variable ones blank (spec §5.4).
    const [amounts, setAmounts] = useState(() =>
        Object.fromEntries(
            components.map((c) => {
                const source =
                    payslip ?? (c.isVariable === 0 ? lastPayslip : null);
                const minor = source?.lines.find(
                    (l) => l.componentId === c.id
                )?.amount;
                return [
                    c.id,
                    minor === undefined ? "" : fromMinor(minor, dp).toFixed(dp),
                ];
            })
        )
    );
    const [payDate, setPayDate] = useState(payslip?.payDate ?? todayIso());
    const [periodLabel, setPeriodLabel] = useState(
        payslip?.periodLabel ??
            formatMonthYear(payslip?.payDate ?? todayIso(), money.locale)
    );
    // An untouched label follows the pay date; once typed in, it stays put.
    const [labelEdited, setLabelEdited] = useState(
        payslip?.periodLabel != null
    );
    const [netOverride, setNetOverride] = useState(
        payslip?.netPay != null ? fromMinor(payslip.netPay, dp).toFixed(dp) : ""
    );
    const [error, setError] = useState("");

    const pending = create.isPending || update.isPending;
    const minorOf = (value: string | undefined) => {
        const major = Number(value);
        return value && Number.isFinite(major) ? toMinor(major, dp) : 0;
    };
    const sumOf = (kind: string) =>
        components
            .filter((c) => c.kind === kind)
            .reduce((sum, c) => sum + minorOf(amounts[c.id]), 0);
    const gross = sumOf("earning");
    const deductions = sumOf("deduction");
    const computedNet = gross - deductions;
    const overrideMinor = netOverride === "" ? null : minorOf(netOverride);
    const delta = overrideMinor === null ? 0 : overrideMinor - computedNet;

    const changePayDate = (next: string) => {
        setPayDate(next);
        if (!labelEdited) setPeriodLabel(formatMonthYear(next, money.locale));
    };

    const submit = async () => {
        if (!payDate) return setError("Choose a pay date.");
        const typed = [...Object.values(amounts), netOverride];
        if (typed.some((v) => Number.isNaN(Number(v))))
            return setError("Enter amounts as numbers.");
        setError("");
        const fields = {
            payDate,
            periodLabel: periodLabel.trim() || undefined,
            netPay: overrideMinor,
            lines: components
                .map((c) => ({
                    componentId: c.id,
                    amount: minorOf(amounts[c.id]),
                }))
                .filter((line) => line.amount !== 0),
        };
        try {
            if (payslip) {
                await update.mutateAsync({
                    id: payslip.id,
                    expectedUpdatedAt: payslip.updatedAt,
                    ...fields,
                });
            } else {
                await create.mutateAsync({ ownerId, ...fields });
            }
            await Promise.all([
                utils.payslips.list.invalidate(),
                utils.income.overview.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save the payslip."
            );
        }
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={payslip ? "Edit payslip" : "Add payslip"}
            confirm={{
                label: payslip ? "Save" : "Add payslip",
                onClick: () => void submit(),
                pending,
            }}
            aside={
                payslip && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() => onDelete(payslip)}
                    >
                        Delete
                    </Button>
                )
            }
        >
            <div className="grid grid-cols-2 gap-4">
                <TextField
                    label="Pay date"
                    type="date"
                    value={payDate}
                    onChange={(e) => changePayDate(e.currentTarget.value)}
                />
                <TextField
                    label="Period (optional)"
                    placeholder="e.g. October 2026"
                    value={periodLabel}
                    onChange={(e) => {
                        setPeriodLabel(e.currentTarget.value);
                        setLabelEdited(true);
                    }}
                />
            </div>
            {SECTIONS.map(({ kind, title }) => {
                const lines = components.filter((c) => c.kind === kind);
                if (lines.length === 0) return null;
                return (
                    <section key={kind} className="flex flex-col gap-2">
                        <h3 className="text-md font-semibold text-text">
                            {title}
                        </h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {lines.map((c) => (
                                <TextField
                                    key={c.id}
                                    label={c.name}
                                    inputMode="decimal"
                                    prefix={money.symbol}
                                    placeholder="0.00"
                                    value={amounts[c.id] ?? ""}
                                    onChange={(e) => {
                                        const { value } = e.currentTarget;
                                        setAmounts((current) => ({
                                            ...current,
                                            [c.id]: value,
                                        }));
                                    }}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
            <div className="flex flex-col gap-1 rounded-lg bg-sunken p-3">
                <StatRow label="Gross" value={formatMoney(gross, money)} />
                <StatRow
                    label="Deductions"
                    value={formatMoney(deductions, money)}
                />
                <StatRow
                    label="Net"
                    value={formatMoney(computedNet, money)}
                    total
                />
            </div>
            <TextField
                label="Actual net pay (if it differs)"
                inputMode="decimal"
                prefix={money.symbol}
                placeholder="0.00"
                value={netOverride}
                onChange={(e) => setNetOverride(e.currentTarget.value)}
            />
            {overrideMinor !== null && (
                <Badge
                    variant={delta === 0 ? "tint" : "attention"}
                    className="self-start"
                >
                    {delta === 0
                        ? "Matches the net above"
                        : `${delta > 0 ? "+" : ""}${formatMoney(delta, money)} against the net above`}
                </Badge>
            )}
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
