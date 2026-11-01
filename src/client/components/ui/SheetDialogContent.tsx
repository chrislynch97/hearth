import { useEffect, type ComponentProps, type CSSProperties } from "react";
import { DialogContent } from "@/components/shadcn/dialog";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useSheetDrag } from "@/hooks/useSheetDrag";

// A bottom sheet on a phone, a centred dialog from `sm` up: same element, so no
// breakpoint hook. The inset lifts it clear of the on-screen keyboard.
const SHEET_ON_PHONE =
    "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-(--keyboard-inset) max-sm:left-0 max-sm:max-h-[calc(90dvh-var(--keyboard-inset))] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overscroll-contain max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=open]:zoom-in-100";

export type SheetDialogContentProps = ComponentProps<typeof DialogContent>;

/** shadcn's DialogContent, styled for Hearth and fitted to phones, where it pulls
 *  down to dismiss, for anything that opens over a page. Opens on the field
 *  marked `data-autofocus`, else the first thing it can focus. */
export const SheetDialogContent = ({
    className = "",
    style,
    children,
    onOpenAutoFocus,
    ...props
}: SheetDialogContentProps) => {
    const keyboardInset = useKeyboardInset();
    const dragRef = useSheetDrag();

    // The browser only scrolls a field clear of the keyboard when it's tapped,
    // not when the dialog focuses it on opening.
    useEffect(() => {
        if (keyboardInset > 0) {
            document.activeElement?.scrollIntoView({ block: "nearest" });
        }
    }, [keyboardInset]);

    return (
        <DialogContent
            ref={dragRef}
            className={`hearth-ds max-h-[90dvh] overflow-y-auto bg-raised sm:max-w-md ${SHEET_ON_PHONE} ${className}`}
            style={
                {
                    "--keyboard-inset": `${keyboardInset}px`,
                    ...style,
                } as CSSProperties
            }
            onOpenAutoFocus={(event) => {
                onOpenAutoFocus?.(event);
                const marked = (
                    event.currentTarget as HTMLElement
                ).querySelector<HTMLElement>("[data-autofocus]");
                if (!marked) return;
                event.preventDefault();
                marked.focus();
            }}
            {...props}
        >
            <span
                aria-hidden
                className="mx-auto -mt-3 -mb-2 h-1 w-10 rounded-full bg-border-strong sm:hidden"
            />
            {children}
        </DialogContent>
    );
};
