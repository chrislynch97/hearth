import { useEffect, useRef, type ReactNode } from "react";

export interface EditorPanelProps {
    title: string;
    /** The thing being edited, under the title — a pot name, a category name. */
    subtitle?: string;
    /** A sheet where the screen is phone-shaped, a centred modal anywhere else.
     *  Same form either way, and over the page either way: docking it beside
     *  the plan meant the cards resized underneath you every time it opened. */
    mode: "sheet" | "modal";
    /** The page wants it gone. It plays its exit before saying so. */
    exiting: boolean;
    /** Safe to unmount now. */
    onExited: () => void;
    /** Ask to close — the X, Escape, a tap on the backdrop. */
    onClose: () => void;
    children: ReactNode;
}

/** Matches `duration-200` below. */
const EXIT_MS = 200;

const DIALOG_CLASS = [
    "z-50 overflow-y-auto border-border bg-raised text-text",
    "backdrop:bg-overlay backdrop:transition-opacity backdrop:duration-200",
    "starting:open:backdrop:opacity-0 data-closing:backdrop:opacity-0",
    "motion-reduce:transition-none",
].join(" ");

// The UA centres a dialog and caps its width; this one is pinned to the bottom
// edge, full width, with the home indicator kept clear. The exit runs while the
// dialog is still open — see the effect — because a closed dialog is
// display: none and has nothing left to animate.
const SHEET_CLASS = [
    "fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none max-h-[88dvh]",
    "rounded-t-lg border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
    "transition-[translate] duration-200 ease-out data-closing:ease-in",
    "starting:open:translate-y-full data-closing:translate-y-full",
].join(" ");

// Centred by the UA's own `inset: 0; margin: auto`, so it only needs a size.
const MODAL_CLASS = [
    "w-[min(26rem,calc(100vw-2rem))] max-h-[85dvh]",
    "rounded-md border p-4",
    "transition-[opacity,scale] duration-200 ease-out data-closing:ease-in",
    "starting:open:scale-95 starting:open:opacity-0",
    "data-closing:scale-95 data-closing:opacity-0",
].join(" ");

const CloseIcon = () => (
    <svg
        viewBox="0 0 24 24"
        width={14}
        height={14}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0"
    >
        <path d="M6 6l12 12M18 6 6 18" />
    </svg>
);

/** The one place anything on this page is edited: a native `<dialog>`, which
 *  brings the focus trap, the inert page behind it and the top layer with it. */
export const EditorPanel = ({
    title,
    subtitle,
    mode,
    exiting,
    onExited,
    onClose,
    children,
}: EditorPanelProps) => {
    const dialog = useRef<HTMLDialogElement>(null);
    const exit = useRef(onExited);
    const requestClose = useRef(onClose);

    useEffect(() => {
        exit.current = onExited;
        requestClose.current = onClose;
    }, [onExited, onClose]);

    useEffect(() => {
        const element = dialog.current;
        if (!element) return;

        if (!element.open) element.showModal();

        // Escape would close the dialog on the spot, skipping the exit. Send it
        // down the same path as every other way out.
        const onCancel = (event: Event) => {
            event.preventDefault();
            requestClose.current();
        };
        element.addEventListener("cancel", onCancel);

        // The browser can still close it without asking: `cancel` only fires
        // if there has been user activation since, so a second Escape or an
        // Android back gesture closes the dialog outright. No exit to play by
        // then — just let the page catch up, or it is left holding a closed
        // dialog and a page that will not scroll. The `open` check skips a stale
        // event: StrictMode's cleanup closes the dialog and its re-mount reopens
        // it, and that first close is still queued when the listener returns.
        const onNativeClose = () => {
            if (!element.open) exit.current();
        };
        element.addEventListener("close", onNativeClose);

        // A modal dialog doesn't stop the page behind it scrolling.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            // Listeners off before the close below, or unmounting would report
            // itself as a browser-initiated close.
            element.removeEventListener("cancel", onCancel);
            element.removeEventListener("close", onNativeClose);
            document.body.style.overflow = previousOverflow;
            if (element.open) element.close();
        };
    }, [mode]);

    useEffect(() => {
        if (!exiting) return;

        const timer = window.setTimeout(() => exit.current(), EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [exiting]);

    return (
        <dialog
            ref={dialog}
            aria-label={title}
            data-closing={exiting || undefined}
            className={[
                DIALOG_CLASS,
                mode === "sheet" ? SHEET_CLASS : MODAL_CLASS,
            ].join(" ")}
            // Anything landing on the dialog itself is the backdrop: its own
            // content sits in the children above it.
            onClick={(event) => {
                if (event.target === dialog.current) onClose();
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-h3 font-medium">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="mt-1 truncate text-sm text-text-muted">
                            {subtitle}
                        </p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close editor"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-text-muted hover:bg-hover"
                >
                    <CloseIcon />
                </button>
            </div>
            <div className="mt-4">{children}</div>
        </dialog>
    );
};
