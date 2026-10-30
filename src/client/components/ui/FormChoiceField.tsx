import {
    Controller,
    type Control,
    type FieldPath,
    type FieldValues,
    type RegisterOptions,
} from "react-hook-form";
import { ChoiceField, type ChoiceOption } from "@/components/ui/ChoiceField";

// Radix Select can't hold an empty value, so "nothing picked" needs a stand-in.
const EMPTY = "none";

export interface FormChoiceFieldProps<T extends FieldValues> {
    control: Control<T>;
    name: FieldPath<T>;
    rules?: RegisterOptions<T, FieldPath<T>>;
    label: string;
    description?: string;
    options: Array<ChoiceOption<string>>;
    placeholder?: string;
    /** An option that stores an empty value, e.g. "Uncategorised". */
    emptyLabel?: string;
    error?: string;
    /** Runs before the form takes the new value, for anything that depends on it. */
    onValueChange?: (value: string) => void;
    className?: string;
}

/** `ChoiceField` wired to react-hook-form, for a form whose empty string means
 *  nothing chosen. */
export const FormChoiceField = <T extends FieldValues>({
    control,
    name,
    rules,
    label,
    description,
    options,
    placeholder,
    emptyLabel,
    error,
    onValueChange,
    className,
}: FormChoiceFieldProps<T>) => (
    <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field }) => (
            <ChoiceField
                label={label}
                description={description}
                placeholder={placeholder}
                options={
                    emptyLabel
                        ? [{ value: EMPTY, label: emptyLabel }, ...options]
                        : options
                }
                value={field.value || (emptyLabel ? EMPTY : null)}
                onChange={(value) => {
                    onValueChange?.(value);
                    field.onChange(value === EMPTY ? "" : value);
                }}
                error={error}
                className={className}
            />
        )}
    />
);
