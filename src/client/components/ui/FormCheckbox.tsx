import {
    Controller,
    type Control,
    type FieldPath,
    type FieldValues,
} from "react-hook-form";
import { CheckboxField } from "@/components/ui/CheckboxField";

export interface FormCheckboxProps<T extends FieldValues> {
    control: Control<T>;
    name: FieldPath<T>;
    label: string;
    description?: string;
}

/** `CheckboxField` wired to react-hook-form. */
export const FormCheckbox = <T extends FieldValues>({
    control,
    name,
    label,
    description,
}: FormCheckboxProps<T>) => (
    <Controller
        control={control}
        name={name}
        render={({ field }) => (
            <CheckboxField
                checked={field.value}
                onCheckedChange={field.onChange}
                label={label}
                description={description}
            />
        )}
    />
);
