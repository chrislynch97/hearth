import { useEffect, type CSSProperties, type ReactNode } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/ui/Button";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

// A bottom sheet on a phone, a centred dialog from `sm` up: same element, so no
// breakpoint hook. The inset lifts it clear of the on-screen keyboard.
const SHEET_ON_PHONE =
    "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-(--keyboard-inset) max-sm:left-0 max-sm:max-h-[calc(90dvh-var(--keyboard-inset))] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=open]:zoom-in-100";

export interface ConfirmDialogAction {
    label: string;
    onClick: () => void;
    pending?: boolean;
    disabled?: boolean;
}

export interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /** A one-line summary under the title. */
    description?: ReactNode;
    /** The detail, and any fields the confirm depends on. */
    children?: ReactNode;
    /** Leave out for a dialog that only shows something. */
    confirm?: ConfirmDialogAction;
    /** `danger` makes the confirm the solid red one. */
    tone?: "default" | "danger";
    /** A second way through (e.g. "Save without sending"), left of confirm. */
    secondary?: ConfirmDialogAction;
    /** Pinned to the footer's far side, e.g. an Archive that isn't the point. */
    aside?: ReactNode;
}

/** "Are you sure?" with room for the consequences and for whatever has to be
 *  typed first. Closes from its corner or by tapping outside; the confirm stays
 *  where the thumb is. */
export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    children,
    confirm,
    tone = "default",
    secondary,
    aside,
}: ConfirmDialogProps) => {
    const keyboardInset = useKeyboardInset();

    const busy = Boolean(confirm?.pending || secondary?.pending);

    // The browser only scrolls a field clear of the keyboard when it's tapped,
    // not when the dialog focuses it on opening.
    useEffect(() => {
        if (keyboardInset > 0) {
            document.activeElement?.scrollIntoView({ block: "nearest" });
        }
    }, [keyboardInset]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`hearth-ds max-h-[90dvh] gap-5 overflow-y-auto bg-raised sm:max-w-md ${SHEET_ON_PHONE}`}
                style={
                    {
                        "--keyboard-inset": `${keyboardInset}px`,
                    } as CSSProperties
                }
            >
                <DialogHeader className="text-left">
                    <DialogTitle className="font-display text-h3 font-medium">
                        {title}
                    </DialogTitle>
                    {description && (
                        <DialogDescription className="text-base text-text-secondary">
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>
                {children && (
                    <div className="flex flex-col gap-4 text-base text-text">
                        {children}
                    </div>
                )}
                <DialogFooter className="gap-2">
                    {aside && (
                        <div className="flex sm:mr-auto [&>*]:flex-1">
                            {aside}
                        </div>
                    )}
                    {secondary && (
                        <Button
                            variant="outline"
                            disabled={busy || secondary.disabled}
                            onClick={secondary.onClick}
                        >
                            {secondary.label}
                        </Button>
                    )}
                    {confirm && (
                        <Button
                            variant={
                                tone === "danger" ? "destructive" : "solid"
                            }
                            disabled={busy || confirm.disabled}
                            onClick={confirm.onClick}
                        >
                            {confirm.label}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
