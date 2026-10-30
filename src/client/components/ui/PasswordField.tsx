import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField, type TextFieldProps } from "@/components/ui/TextField";

export type PasswordFieldProps = Omit<TextFieldProps, "type" | "trailing">;

/** A password input with a show/hide toggle, handy on a phone keyboard. Out of
 *  the tab order, so Tab still goes straight from the field to submit. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
    (props, ref) => {
        const [shown, setShown] = useState(false);

        return (
            <TextField
                {...props}
                ref={ref}
                type={shown ? "text" : "password"}
                trailing={
                    <Button
                        variant="ghost"
                        compact
                        tabIndex={-1}
                        aria-label={shown ? "Hide password" : "Show password"}
                        className="mr-1 size-7 shrink-0 px-0 text-text-muted"
                        onClick={() => setShown((v) => !v)}
                    >
                        {shown ? (
                            <EyeOff className="size-4" />
                        ) : (
                            <Eye className="size-4" />
                        )}
                    </Button>
                }
            />
        );
    }
);

PasswordField.displayName = "PasswordField";
