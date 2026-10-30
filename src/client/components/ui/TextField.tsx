import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    description?: string;
    /** The resolver's message for this field. Present means invalid. */
    error?: string;
    /** Sits inside the field ahead of the value — a currency symbol, a unit. */
    prefix?: string;
    /** Keeps the label for assistive tech only, where the row around the field
     *  already says what it is. */
    hideLabel?: boolean;
}

// shadcn's Input, sized and coloured for Hearth: 13px text at every width (its
// own `md:text-sm` would drop to 12px) and the page background inside.
const FIELD =
    "h-9 border-border-strong bg-bg text-base md:text-base dark:bg-bg placeholder:text-text-faint";

/** A labelled input on shadcn's Input. Forwards its ref so
 *  `{...register("name")}` works as-is. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
    (
        {
            label,
            description,
            error,
            prefix,
            hideLabel = false,
            id,
            className = "",
            ...rest
        },
        ref
    ) => {
        const generatedId = useId();
        const inputId = id ?? generatedId;
        const describedBy = description ? `${inputId}-description` : undefined;
        const errorId = error ? `${inputId}-error` : undefined;

        const input = (extra: string) => (
            <Input
                {...rest}
                id={inputId}
                ref={ref}
                aria-invalid={error ? true : undefined}
                aria-describedby={
                    [errorId, describedBy].filter(Boolean).join(" ") ||
                    undefined
                }
                className={`${FIELD} ${extra}`}
            />
        );

        return (
            <div className={className}>
                <Label
                    htmlFor={inputId}
                    className={
                        hideLabel
                            ? "sr-only"
                            : "mb-1.5 text-sm font-medium text-text-secondary"
                    }
                >
                    {label}
                </Label>
                {description && (
                    <p
                        id={describedBy}
                        className="mb-1.5 text-xs leading-snug text-text-muted"
                    >
                        {description}
                    </p>
                )}
                {prefix ? (
                    // The border and ring move to a wrapper so the prefix sits
                    // inside the same box as the value.
                    <div
                        className={[
                            "flex h-9 items-center rounded-md border bg-bg pl-3 shadow-xs transition-[color,box-shadow]",
                            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
                            error
                                ? "border-destructive"
                                : "border-border-strong",
                        ].join(" ")}
                    >
                        <span className="tabular shrink-0 text-base text-text-muted">
                            {prefix}
                        </span>
                        {input(
                            "h-full border-0 pl-1.5 shadow-none focus-visible:ring-0"
                        )}
                    </div>
                ) : (
                    input("")
                )}
                {error && (
                    <p id={errorId} className="mt-1.5 text-xs text-danger">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

TextField.displayName = "TextField";
