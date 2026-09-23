import { useState } from "react";
import { Button } from "@/components/ui/Button";

export interface ArchiveActionProps {
    label: string;
    /** What archiving actually does to everything hanging off it. */
    consequence: string;
    pending: boolean;
    onArchive: () => void;
}

/** Archive, confirmed in place. A dialog over a docked panel would be a third
 *  layer of chrome for a one-line question. */
export const ArchiveAction = ({
    label,
    consequence,
    pending,
    onArchive,
}: ArchiveActionProps) => {
    const [confirming, setConfirming] = useState(false);

    return (
        <div className="mt-4 border-t border-border pt-3.5">
            {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-sm text-text">Sure?</p>
                    <Button
                        variant="ghost"
                        compact
                        onClick={() => setConfirming(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        compact
                        className="border-danger"
                        disabled={pending}
                        onClick={onArchive}
                    >
                        {label}
                    </Button>
                </div>
            ) : (
                <Button
                    variant="danger"
                    compact
                    className="px-0"
                    onClick={() => setConfirming(true)}
                >
                    {label}
                </Button>
            )}
            <p className="mt-1.5 text-xs leading-snug text-text-muted">
                {consequence}
            </p>
        </div>
    );
};
