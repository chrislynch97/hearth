import { forwardRef, useId, type SelectHTMLAttributes } from "react";

export interface SelectOption {
    value: string;
    label: string;
}

/** A labelled run of options — an `<optgroup>`, which the native picker draws
 *  as a header above them. */
export interface SelectOptionGroup {
    label: string;
    options: SelectOption[];
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label: string;
    description?: string;
    error?: string;
    options: (SelectOption | SelectOptionGroup)[];
    /** The first option, with an empty value. Selectable, so picking it clears
     *  the field; shown muted while it is the one chosen. */
    placeholder?: string;
}

/** A labelled native select. Native because it is the only picker that behaves
 *  on a phone, and everything here is a short list. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
    (
        {
            label,
            description,
            error,
            options,
            placeholder,
            id,
            className = "",
            ...rest
        },
        ref
    ) => {
        const generatedId = useId();
        const selectId = id ?? generatedId;
        const describedBy = description ? `${selectId}-description` : undefined;
        const errorId = error ? `${selectId}-error` : undefined;

        return (
            <div className={className}>
                <label
                    htmlFor={selectId}
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
                        "relative flex h-[34px] items-center rounded-sm border bg-bg",
                        "transition-colors duration-[140ms] ease-out",
                        "focus-within:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-ring)]",
                        error
                            ? "border-danger"
                            : "border-border-strong focus-within:border-primary",
                    ].join(" ")}
                >
                    <select
                        {...rest}
                        id={selectId}
                        ref={ref}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={
                            [errorId, describedBy].filter(Boolean).join(" ") ||
                            undefined
                        }
                        // Chrome paints the dropdown from the control's
                        // own background and its options', not the wrapper's:
                        // leave these transparent and the popup comes out white
                        // on a dark theme however `color-scheme` is set.
                        // Muted while the empty option is the chosen one, so a
                        // placeholder reads as "nothing picked" rather than as
                        // one more choice. CSS alone, so it works uncontrolled
                        // under react-hook-form as well as controlled.
                        className="h-full w-full cursor-pointer rounded-sm bg-bg pl-2.5 pr-7 text-base text-text outline-none has-[option[value='']:checked]:text-text-muted"
                    >
                        {placeholder && (
                            <option value="" className="bg-surface text-text">
                                {placeholder}
                            </option>
                        )}
                        {options.map((item) =>
                            "options" in item ? (
                                <optgroup
                                    key={item.label}
                                    label={item.label}
                                    className="bg-surface text-text-muted"
                                >
                                    {item.options.map((option) => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                            className="bg-surface text-text"
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ) : (
                                <option
                                    key={item.value}
                                    value={item.value}
                                    className="bg-surface text-text"
                                >
                                    {item.label}
                                </option>
                            )
                        )}
                    </select>
                    <svg
                        viewBox="0 0 24 24"
                        width={14}
                        height={14}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 text-text-faint"
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
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

SelectField.displayName = "SelectField";
