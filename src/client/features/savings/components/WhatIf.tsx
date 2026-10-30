import { formatMoney, fromMinor, toMinor } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import type { SavingsPlanInput } from "@shared/savings";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Slider } from "@/components/shadcn/slider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
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
        <Card>
            <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
                    <div className="flex items-end gap-2">
                        <TextField
                            label="What if we put in"
                            type="number"
                            min={0}
                            step={fromMinor(step, money.decimalPlaces)}
                            inputMode="decimal"
                            prefix={money.symbol}
                            value={fromMinor(amount, money.decimalPlaces)}
                            onChange={(event) =>
                                fromText(event.currentTarget.value)
                            }
                            className="w-36"
                        />
                        <span className="pb-2 text-sm text-text-muted">
                            {unit}
                        </span>
                    </div>
                    <Slider
                        aria-label="What-if amount"
                        min={0}
                        max={max}
                        step={step}
                        value={[amount]}
                        onValueChange={([value = 0]) => onChange(value)}
                        className="min-w-0 flex-1 py-3"
                    />
                </div>
                <p className="max-w-[70ch] text-base text-text-secondary">
                    <strong className="font-semibold text-text">{lead}</strong>
                    {rest}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Button
                        disabled={
                            !canSwitch ||
                            pending ||
                            amount === input.contribution
                        }
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => onSwitch(amount)}
                    >
                        Switch to {formatMoney(amount, money)}
                        {unit}
                    </Button>
                    <span className="text-sm text-text-muted">
                        {canSwitch
                            ? `Changes the ${potName} pot's set-aside, so Funding updates too.`
                            : `The ${potName} pot has several contribution lines. Change them on Plan.`}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
};
