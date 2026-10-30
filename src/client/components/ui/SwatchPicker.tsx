import { Check } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { RadioGroup } from "@/components/shadcn/radio-group";

export interface Swatch {
    name: string;
    value: string;
}

export interface SwatchPickerProps {
    /** Names the group for assistive tech, e.g. "Colour for Ava". */
    label: string;
    swatches: readonly Swatch[];
    value: string | null;
    onChange: (value: string) => void;
}

/** A row of colour dots to pick one from. A radio group underneath (shadcn's,
 *  with our own dot for the item), so arrow keys move between colours and only
 *  the chosen one is a tab stop. */
export const SwatchPicker = ({
    label,
    swatches,
    value,
    onChange,
}: SwatchPickerProps) => (
    <RadioGroup
        aria-label={label}
        value={value ?? undefined}
        onValueChange={onChange}
        className="flex flex-wrap gap-1.5"
    >
        {swatches.map((swatch) => (
            <RadioGroupPrimitive.Item
                key={swatch.value}
                value={swatch.value}
                aria-label={swatch.name}
                title={swatch.name}
                // The swatch's own colour is the data here, not styling.
                style={{ backgroundColor: swatch.value }}
                className="flex size-7 items-center justify-center rounded-full text-white outline-none transition-transform duration-[140ms] ease-out hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:ring-2 data-[state=checked]:ring-text data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-surface sm:size-6"
            >
                <RadioGroupPrimitive.Indicator>
                    <Check size={13} strokeWidth={3} />
                </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
        ))}
    </RadioGroup>
);
