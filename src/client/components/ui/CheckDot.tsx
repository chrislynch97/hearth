import { Check } from "lucide-react";

export interface CheckDotProps {
    done: boolean;
}

/** A step's state in a checklist: an empty ring until it's done, then a filled
 *  moss tick. */
export const CheckDot = ({ done }: CheckDotProps) => (
    <span
        aria-hidden="true"
        className={[
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            done
                ? "bg-primary-fill text-primary-fg"
                : "border-2 border-border-strong",
        ].join(" ")}
    >
        {done && <Check size={14} strokeWidth={3} />}
    </span>
);
