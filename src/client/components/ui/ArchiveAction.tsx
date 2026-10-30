import { useState } from "react";
import { Button } from "@/components/ui/Button";

export interface ArchiveActionProps {
    label: string;
    /** What archiving actually does to everything hanging off it. */
    consequence: string;
    pending: boolean;
    onArchive: () => void;
}

/** Archive or delete, confirmed in place: a button in a form's footer that opens
 *  out to say what it'll do. A dialog over the sheet would be one layer too many. */
export const ArchiveAction = ({
    label,
    consequence,
    pending,
    onArchive,
}: ArchiveActionProps) => {
    const [confirming, setConfirming] = useState(false);

    if (!confirming) {
        return (
            <Button
                variant="danger-outline"
                className="max-sm:h-9"
                onClick={() => setConfirming(true)}
            >
                {label}
            </Button>
        );
    }

    return (
        <div
            data-confirming
            className="flex w-full flex-col gap-3 rounded-lg bg-danger-tint p-3"
        >
            <p className="text-sm text-text">{consequence}</p>
            <div className="flex justify-end gap-2 max-sm:[&>*]:h-9 max-sm:[&>*]:flex-1">
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Keep it
                </Button>
                <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={onArchive}
                >
                    {label}
                </Button>
            </div>
        </div>
    );
};
