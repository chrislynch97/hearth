import type { ReactNode } from "react";
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/ui/Button";
import { SheetDialogContent } from "@/components/ui/SheetDialogContent";

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
    const busy = Boolean(confirm?.pending || secondary?.pending);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <SheetDialogContent className="gap-5">
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
            </SheetDialogContent>
        </Dialog>
    );
};
