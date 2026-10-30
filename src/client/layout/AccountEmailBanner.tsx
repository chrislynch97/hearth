import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { trpc } from "@/trpc";
import { useEmailConfirmation } from "@/useEmailConfirmation";

// Dismissal is keyed on the address it was shown for, so moving to a new
// (again unconfirmed) address brings the nudge back rather than staying hidden
// on a decision made about a different address.
const DISMISS_KEY = "hearth:email-nudge-dismissed";
const NO_ADDRESS = "none";

/** Nudges an account towards a *confirmed* address, which is what password reset
 *  actually needs (#199, #198). Deliberately a prompt and not a gate: these
 *  accounts work fine today, and locking someone out of their own finances to
 *  make a recovery point would be worse than the gap it closes.
 *
 *  Only on an instance that can send mail — without a relay there is nothing to
 *  confirm with, and asking would be nonsense. */
export const AccountEmailBanner = () => {
    const status = trpc.auth.status.useQuery();
    const { enabled, email, verified, required, sentTo, error, sending, send } =
        useEmailConfirmation();
    const [dismissed, setDismissed] = useState(() =>
        localStorage.getItem(DISMISS_KEY)
    );

    // No address at all is only worth raising where one is required (#199) —
    // going without is a legitimate choice on a LAN install. An address that's
    // present but unproven is dead for recovery anywhere there's a password to
    // lose (#198), and an invited account arrives in exactly that state.
    const worthSaying = email
        ? required || Boolean(status.data?.passwordSet)
        : required;

    if (
        !enabled ||
        verified ||
        !worthSaying ||
        dismissed === (email ?? NO_ADDRESS)
    ) {
        return null;
    }

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, email ?? NO_ADDRESS);
        setDismissed(email ?? NO_ADDRESS);
    };

    const action = sentTo ? undefined : email ? (
        <Button
            variant="attention"
            disabled={sending}
            onClick={() => void send()}
        >
            Send confirmation email
        </Button>
    ) : (
        <Button asChild>
            <Link to="/settings/account">Add one</Link>
        </Button>
    );

    return (
        <div className="hearth-ds mb-5">
            <Notice
                tone="attention"
                title={
                    email
                        ? "Confirm your email address"
                        : "Add an email address"
                }
                action={action}
                onDismiss={dismiss}
            >
                {sentTo
                    ? `Check ${sentTo} for the confirmation link.`
                    : email
                      ? "Until it's confirmed, it can't reset your password if you lose it."
                      : "Without one there's no way to reset your password if you lose it."}
                {error && (
                    <span className="mt-1 block text-danger">{error}</span>
                )}
            </Notice>
        </div>
    );
};
