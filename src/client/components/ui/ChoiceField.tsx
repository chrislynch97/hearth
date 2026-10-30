import { useId } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/select";
import { Label } from "@/components/shadcn/label";

export interface ChoiceOption<T extends string> {
    value: T;
    label: string;
}

export interface ChoiceFieldProps<T extends string> {
    label: string;
    description?: string;
    /** The form's message for this field. Present means invalid. */
    error?: string;
    options: readonly ChoiceOption<T>[];
    value: T | null;
    onChange: (value: T) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Keeps the label for assistive tech only, where a row already says what
     *  the picker is for. */
    hideLabel?: boolean;
    className?: string;
}

/** A labelled pick-one-of-these, on shadcn's Select — the menu opens over the
 *  page, typeahead jumps to an option, and it reads as a combobox. */
export const ChoiceField = <T extends string>({
    label,
    description,
    error,
    options,
    value,
    onChange,
    placeholder,
    disabled,
    hideLabel = false,
    className = "",
}: ChoiceFieldProps<T>) => {
    const id = useId();
    const descriptionId = description ? `${id}-description` : undefined;

    return (
        <div className={className}>
            <Label
                htmlFor={id}
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
                    id={descriptionId}
                    className="mb-1.5 text-xs leading-snug text-text-muted"
                >
                    {description}
                </p>
            )}
            <Select
                value={value ?? undefined}
                onValueChange={(v) => onChange(v as T)}
                disabled={disabled}
            >
                <SelectTrigger
                    id={id}
                    aria-describedby={descriptionId}
                    aria-invalid={error ? true : undefined}
                    className="w-full border-border-strong bg-bg text-base data-[size=default]:h-9 dark:bg-bg dark:hover:bg-bg"
                >
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent position="popper" className="hearth-ds max-h-72">
                    {options.map((option) => (
                        <SelectItem
                            key={option.value}
                            value={option.value}
                            className="text-base"
                        >
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
    );
};
