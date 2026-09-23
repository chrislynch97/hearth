import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface CheckboxProps extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type"
> {
    label: string;
    description?: string;
}

/** Native, tinted with `accent-color`: the browser draws a checkbox better than
 *  a hand-rolled box and a floated tick, and it stays uncontrolled so
 *  `{...register(…)}` works unchanged. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ label, description, id, className = "", ...rest }, ref) => {
        const generatedId = useId();
        const inputId = id ?? generatedId;

        return (
            <div className={["flex gap-2.5", className].join(" ")}>
                <input
                    {...rest}
                    type="checkbox"
                    id={inputId}
                    ref={ref}
                    className="accent-primary mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                />
                <div className="min-w-0">
                    <label
                        htmlFor={inputId}
                        className="cursor-pointer text-base text-text"
                    >
                        {label}
                    </label>
                    {description && (
                        <p className="mt-0.5 text-xs leading-snug text-text-muted">
                            {description}
                        </p>
                    )}
                </div>
            </div>
        );
    }
);

Checkbox.displayName = "Checkbox";
