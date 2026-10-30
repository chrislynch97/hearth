import { useEffect, useRef, type ReactNode } from "react";
import {
    Dialog,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/dialog";
import { SheetDialogContent } from "@/components/ui/SheetDialogContent";

export interface EditorPanelProps {
    title: string;
    /** The thing being edited, under the title — a pot name, a category name. */
    subtitle?: string;
    /** The page wants it gone. It plays its exit before saying so. */
    exiting: boolean;
    /** Safe to unmount now. */
    onExited: () => void;
    /** Ask to close — the X, Escape, a tap on the backdrop. */
    onClose: () => void;
    children: ReactNode;
}

/** Matches the dialog's own 200ms exit. */
const EXIT_MS = 200;

/** Where a page edits things: a form over the page, as a sheet on a phone. The
 *  form brings its own actions. Opens ready to type, in the field a form marks
 *  `data-autofocus`, else its first. */
export const EditorPanel = ({
    title,
    subtitle,
    exiting,
    onExited,
    onClose,
    children,
}: EditorPanelProps) => {
    const body = useRef<HTMLDivElement>(null);
    const exit = useRef(onExited);

    useEffect(() => {
        exit.current = onExited;
    }, [onExited]);

    useEffect(() => {
        if (!exiting) return;

        const timer = window.setTimeout(() => exit.current(), EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [exiting]);

    return (
        <Dialog open={!exiting} onOpenChange={(open) => !open && onClose()}>
            <SheetDialogContent
                className="gap-4"
                onOpenAutoFocus={(event) => {
                    const marked =
                        body.current?.querySelector<HTMLElement>(
                            "[data-autofocus]"
                        );
                    if (!marked) return;
                    event.preventDefault();
                    marked.focus();
                }}
            >
                <DialogHeader className="text-left">
                    <DialogTitle className="font-display text-h3 font-medium">
                        {title}
                    </DialogTitle>
                    <DialogDescription
                        className={
                            subtitle
                                ? "truncate text-sm text-text-muted"
                                : "sr-only"
                        }
                    >
                        {subtitle ?? title}
                    </DialogDescription>
                </DialogHeader>
                <div ref={body}>{children}</div>
            </SheetDialogContent>
        </Dialog>
    );
};
