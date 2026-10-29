import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

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

/** A row of colour dots to pick one from — a radio group, so arrow keys move
 *  between them and only the chosen one is a tab stop. */
export const SwatchPicker = ({
    label,
    swatches,
    value,
    onChange,
}: SwatchPickerProps) => {
    const groupRef = useRef<HTMLDivElement>(null);

    const selected = swatches.findIndex((s) => s.value === value);
    const tabStop = selected === -1 ? 0 : selected;

    const move = (event: KeyboardEvent, from: number) => {
        const step =
            event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = (from + step + swatches.length) % swatches.length;
        onChange(swatches[next]!.value);
        const radios =
            groupRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="radio"]'
            );
        radios?.[next]?.focus();
    };

    return (
        <div
            ref={groupRef}
            role="radiogroup"
            aria-label={label}
            className="flex flex-wrap gap-1.5"
        >
            {swatches.map((swatch, i) => {
                const checked = i === selected;
                return (
                    <button
                        key={swatch.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={swatch.name}
                        title={swatch.name}
                        tabIndex={i === tabStop ? 0 : -1}
                        onClick={() => onChange(swatch.value)}
                        onKeyDown={(event) => move(event, i)}
                        // The swatch's own colour is the data here, not styling.
                        style={{ backgroundColor: swatch.value }}
                        className={[
                            "flex size-6 items-center justify-center rounded-full text-white transition-transform duration-[140ms] ease-out hover:scale-110",
                            checked
                                ? "ring-2 ring-text ring-offset-2 ring-offset-surface"
                                : "",
                        ].join(" ")}
                    >
                        {checked && <Check size={13} strokeWidth={3} />}
                    </button>
                );
            })}
        </div>
    );
};
