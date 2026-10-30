import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SaveBarProps {
    /** There are edits to save — the bar only shows while this is true. */
    dirty: boolean;
    /** Just saved: the bar stays a moment to say so, where the person looked. */
    saved?: boolean;
    saving: boolean;
    error?: string;
    onSave: () => void;
    onDiscard: () => void;
    saveLabel?: string;
}

// Floats over the page — full width on a phone, a card in the corner on a
// desktop — so it never scrolls away mid-form.
const FLOAT =
    "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 rounded-xl border px-4 py-3 shadow-popover sm:left-auto sm:w-[min(36rem,calc(100vw-2rem))]";

/** Pinned to the foot of the screen while a long form has unsaved edits, so
 *  Save is never a scroll away and leaving with changes is hard to miss. */
export const SaveBar = ({
    dirty,
    saved = false,
    saving,
    error,
    onSave,
    onDiscard,
    saveLabel = "Save changes",
}: SaveBarProps) => {
    if (!dirty && saved) {
        return (
            <div
                role="status"
                className={`${FLOAT} flex items-center gap-2 border-primary/25 bg-primary-tint-weak text-base text-text`}
            >
                <Check size={16} strokeWidth={2} className="text-primary" />
                Changes saved
            </div>
        );
    }
    if (!dirty) return null;

    return (
        <div
            role="region"
            aria-label="Unsaved changes"
            className={`${FLOAT} flex flex-col gap-3 border-border-strong bg-raised sm:flex-row sm:items-center sm:justify-between`}
        >
            <p className={`text-base ${error ? "text-danger" : "text-text"}`}>
                {error || "You have unsaved changes."}
            </p>
            <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                <Button variant="ghost" disabled={saving} onClick={onDiscard}>
                    Discard
                </Button>
                <Button variant="solid" disabled={saving} onClick={onSave}>
                    {saveLabel}
                </Button>
            </div>
        </div>
    );
};
