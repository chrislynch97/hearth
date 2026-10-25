import { useId } from "react";
import { formatMoney, fromMinor, toMinor } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import type { SavingsPlanInput } from "@shared/savings";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { whatIfSentence } from "@/features/savings/model";

export interface WhatIfProps {
    input: SavingsPlanInput;
    /** Per budget period, minor units. */
    amount: number;
    onChange: (amount: number) => void;
    potName: string;
    /** Whether switching can rewrite the pot's set-aside (one line or none). */
    canSwitch: boolean;
    pending: boolean;
    onSwitch: (amount: number) => void;
    money: MoneyFormat;
}

/** A scratchpad amount: the chart draws it, this says what it means, and the
 *  button is the only way to keep it. */
export const WhatIf = ({
    input,
    amount,
    onChange,
    potName,
    canSwitch,
    pending,
    onSwitch,
    money,
}: WhatIfProps) => {
    const formatDate = useFormatDate();
    const inputId = useId();

    const unit = periodUnitLabel(input.period.frequency);
    const step = toMinor(5, money.decimalPlaces);
    // Room either side of today's figure, so the slider is useful both ways.
    const max = Math.max(input.contribution * 2, amount, step * 100);
    const { lead, rest } = whatIfSentence(input, amount, money, formatDate);
    const fromText = (text: string) => {
        const value = Number(text);
        if (Number.isFinite(value) && value >= 0)
            onChange(toMinor(value, money.decimalPlaces));
    };

    return (
        <section className="flex flex-col gap-2.5 rounded-md border border-border bg-raised px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label htmlFor={inputId} className="font-semibold">
                    What if we put in
                </label>
                <span className="inline-flex items-center rounded-sm border border-border-strong bg-bg px-2 focus-within:outline focus-within:outline-2 focus-within:outline-primary">
                    <span className="text-text-muted">{money.symbol}</span>
                    <input
                        id={inputId}
                        type="number"
                        min={0}
                        step={fromMinor(step, money.decimalPlaces)}
                        inputMode="decimal"
                        value={fromMinor(amount, money.decimalPlaces)}
                        onChange={(event) => fromText(event.target.value)}
                        className="tabular w-20 border-0 bg-transparent px-0.5 py-1 text-base text-text outline-none"
                    />
                </span>
                <span className="text-sm text-text-muted">{unit}</span>
                <input
                    type="range"
                    min={0}
                    max={max}
                    step={step}
                    value={amount}
                    aria-label="What-if amount"
                    onChange={(event) => onChange(Number(event.target.value))}
                    className="min-w-0 flex-[1_1_160px] cursor-pointer appearance-auto accent-savings-fg"
                />
            </div>
            <p className="max-w-[70ch] text-base text-text-secondary">
                <strong className="font-semibold text-text">{lead}</strong>
                {rest}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button
                    disabled={
                        !canSwitch || pending || amount === input.contribution
                    }
                    onClick={() => onSwitch(amount)}
                >
                    Switch to {formatMoney(amount, money)}
                    {unit}
                </Button>
                <span className="text-xs text-text-muted">
                    {canSwitch
                        ? `Changes the ${potName} pot's set-aside, so Funding updates too.`
                        : `The ${potName} pot has several contribution lines. Change them on Plan.`}
                </span>
            </div>
        </section>
    );
};
