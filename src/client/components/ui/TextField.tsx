import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    description?: string;
    /** The resolver's message for this field. Present means invalid. */
    error?: string;
    /** Sits inside the field ahead of the value — a currency symbol, a unit. */
    prefix?: string;
}

/** A labelled input. Forwards its ref so `{...register("name")}` works as-is. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
    (
        { label, description, error, prefix, id, className = "", ...rest },
        ref
    ) => {
        const generatedId = useId();
        const inputId = id ?? generatedId;
        const describedBy = description ? `${inputId}-description` : undefined;
        const errorId = error ? `${inputId}-error` : undefined;

        return (
            <div className={className}>
                <label
                    htmlFor={inputId}
                    className="mb-1.5 block text-sm font-medium text-text-secondary"
                >
                    {label}
                </label>
                {description && (
                    <p
                        id={describedBy}
                        className="mb-1.5 text-xs leading-snug text-text-muted"
                    >
                        {description}
                    </p>
                )}
                <div
                    className={[
                        "flex h-[34px] items-center gap-1 rounded-sm border bg-bg px-2.5",
                        "transition-colors duration-[140ms] ease-out",
                        "focus-within:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-ring)]",
                        error
                            ? "border-danger"
                            : "border-border-strong focus-within:border-primary",
                    ].join(" ")}
                >
                    {prefix && (
                        <span className="tabular shrink-0 text-base text-text-muted">
                            {prefix}
                        </span>
                    )}
                    <input
                        {...rest}
                        id={inputId}
                        ref={ref}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={
                            [errorId, describedBy].filter(Boolean).join(" ") ||
                            undefined
                        }
                        className="h-full w-full min-w-0 bg-transparent text-base text-text outline-none placeholder:text-text-faint"
                    />
                </div>
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
