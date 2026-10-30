import { useId, type TextareaHTMLAttributes } from "react";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label: string;
    description?: string;
}

/** A labelled, growing textarea on shadcn's Textarea, matching TextField. */
export const TextAreaField = ({
    label,
    description,
    id,
    className = "",
    ...rest
}: TextAreaFieldProps) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const describedBy = description ? `${fieldId}-description` : undefined;

    return (
        <div className={className}>
            <Label
                htmlFor={fieldId}
                className="mb-1.5 text-sm font-medium text-text-secondary"
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
            <Textarea
                {...rest}
                id={fieldId}
                aria-describedby={describedBy}
                className="min-h-28 border-border-strong bg-bg text-base md:text-base dark:bg-bg placeholder:text-text-faint"
            />
        </div>
    );
};
