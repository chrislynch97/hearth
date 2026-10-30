import type { EmailConfirmation } from "@/useEmailConfirmation";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export interface EmailVerificationProps {
    confirmation: EmailConfirmation;
}

/** Confirmation state for the account's email address, and the button that sends
 *  a fresh link (#111). Only rendered on an instance that can send mail — an
 *  address on a self-host install with no relay is just a note to itself, and
 *  telling people to "confirm" it with no way to would be nonsense. State comes
 *  from the parent so the confirm-on-save dialog and this note agree (#198). */
export const EmailVerification = ({ confirmation }: EmailVerificationProps) => {
    const { enabled, email, verified, sentTo, error, sending, send } =
        confirmation;

    if (!enabled || !email) return null;

    return (
        <>
            {verified ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="tint">Confirmed</Badge>
                    <span className="text-sm text-text-muted">
                        This address can be used to reset your password.
                    </span>
                </div>
            ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Badge variant="attention">Not confirmed</Badge>
                    <span className="flex-1 text-sm text-text-muted">
                        Confirm this address so you can reset your password if
                        you lose it.
                    </span>
                    <Button
                        compact
                        disabled={sending}
                        onClick={() => void send()}
                    >
                        Send confirmation email
                    </Button>
                </div>
            )}
            {sentTo && (
                <Notice tone="positive" title="Email sent">
                    Check <b>{sentTo}</b> for a confirmation link. It expires in
                    24 hours — if it doesn&apos;t arrive, check your spam folder
                    or{" "}
                    <Button variant="link" onClick={() => void send()}>
                        send another
                    </Button>
                    .
                </Notice>
            )}
            {error && <Notice tone="danger" title={error} />}
        </>
    );
};
