import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface ConfirmEmailChangeProps {
    opened: boolean;
    /** The address about to be saved. */
    email: string;
    pending: "save" | "send" | null;
    onCancel: () => void;
    onConfirm: (sendConfirmation: boolean) => void;
}

/** Confirm-on-save for a changed email address (#198). The new address starts
 *  unconfirmed, which quietly takes password reset away — so say it here, where
 *  the person is causing it. Sending stays an explicit press rather than a side
 *  effect of saving, so a mistyped address never mails a stranger on its own. */
export const ConfirmEmailChange = ({
    opened,
    email,
    pending,
    onCancel,
    onConfirm,
}: ConfirmEmailChangeProps) => (
    <ConfirmDialog
        open={opened}
        onOpenChange={(open) => !open && pending === null && onCancel()}
        title="Confirm your new email address"
        confirm={{
            label: "Save and send link",
            onClick: () => onConfirm(true),
            pending: pending === "send",
        }}
        secondary={{
            label: "Save without sending",
            onClick: () => onConfirm(false),
            pending: pending === "save",
        }}
    >
        <p>
            Password reset only ever mails a confirmed address, so until you
            confirm <b>{email}</b> you won&apos;t be able to reset your password
            if you forget it.
        </p>
        <p className="text-text-muted">
            Sending the link now is the quickest way to keep that working. It
            lasts 24 hours, and you can send another from this page at any time.
        </p>
    </ConfirmDialog>
);
