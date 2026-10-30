import { useId } from "react";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Label } from "@/components/shadcn/label";

export interface CheckboxFieldProps {
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

/** A labelled tick-box on shadcn's Checkbox, for state held in React. A form
 *  wired up with react-hook-form's `register` wants the native `Checkbox`. */
export const CheckboxField = ({
    label,
    description,
    checked,
    onCheckedChange,
}: CheckboxFieldProps) => {
    const id = useId();
    const descriptionId = description ? `${id}-description` : undefined;

    return (
        <div className="flex gap-2.5">
            <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(state) => onCheckedChange(state === true)}
                aria-describedby={descriptionId}
                className="mt-0.5"
            />
            <div className="min-w-0">
                <Label htmlFor={id} className="text-base text-text">
                    {label}
                </Label>
                {description && (
                    <p
                        id={descriptionId}
                        className="mt-1 text-sm leading-snug text-text-muted"
                    >
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
};
