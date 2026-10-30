import { useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface CopyFieldProps {
    value: string;
    /** Names the value for assistive tech, e.g. "Invite link". */
    label: string;
    /** Keeps line breaks (a shell command) rather than wrapping one line. */
    multiline?: boolean;
}

/** A value to hand on — a link, a key, a command — with a Copy button. If the
 *  clipboard is refused, the text is selected so a long-press copy still works. */
export const CopyField = ({
    value,
    label,
    multiline = false,
}: CopyFieldProps) => {
    const [copied, setCopied] = useState(false);

    const copy = async (event: MouseEvent<HTMLButtonElement>) => {
        const code = event.currentTarget.parentElement?.querySelector("code");
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            if (code) window.getSelection()?.selectAllChildren(code);
        }
    };

    return (
        <div className="flex items-start gap-2">
            <code
                aria-label={label}
                className={[
                    "min-w-0 flex-1 rounded-md border border-border bg-sunken px-3 py-2 font-mono text-sm text-text",
                    multiline ? "overflow-x-auto whitespace-pre" : "break-all",
                ].join(" ")}
            >
                {value}
            </code>
            <Button
                variant="outline"
                icon={
                    copied ? (
                        <Check size={14} strokeWidth={2} />
                    ) : (
                        <Copy size={14} strokeWidth={1.75} />
                    )
                }
                onClick={(event) => void copy(event)}
                className="h-[38px]"
            >
                {copied ? "Copied" : "Copy"}
            </Button>
        </div>
    );
};
