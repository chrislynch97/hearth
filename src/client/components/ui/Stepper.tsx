import { Check } from "lucide-react";

export interface StepperStep {
    label: string;
    description: string;
}

export interface StepperProps {
    steps: StepperStep[];
    /** Index of the step in progress. */
    active: number;
}

const dotClass = (index: number, active: number) => {
    if (index < active)
        return "border-primary-fill bg-primary-fill text-primary-fg";
    if (index === active)
        return "border-primary bg-primary-tint-weak text-primary";
    return "border-border-strong text-text-muted";
};

/** Where you are in a flow. On a phone only the current step keeps its words, so
 *  the row always fits. */
export const Stepper = ({ steps, active }: StepperProps) => (
    <ol className="m-0 flex list-none items-center gap-3 p-0">
        {steps.map(({ label, description }, index) => (
            <li
                key={label}
                aria-current={index === active ? "step" : undefined}
                className="flex min-w-0 items-center gap-2 sm:flex-1"
            >
                <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${dotClass(index, active)}`}
                >
                    {index < active ? (
                        <Check className="size-3.5" />
                    ) : (
                        index + 1
                    )}
                </span>
                <span
                    className={`min-w-0 ${index === active ? "" : "max-sm:sr-only"}`}
                >
                    <span className="block truncate text-sm font-semibold text-text">
                        {label}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                        {description}
                    </span>
                </span>
            </li>
        ))}
    </ol>
);
